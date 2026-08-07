/**
 * Rule-based running analytics.
 * Poori tarah deterministic — koi API call nahi, koi cost nahi.
 * Har number user ke apne approved submissions se nikalta hai.
 */

/* ── Distance parsing ────────────────────────────────────────
   "5km" → 5 | "1600MTR" → 1.6 | "Cycling 25km" → 25 | "Walking 10km" → 10
*/
const parseDistanceKm = (raw) => {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();

  // 1600 metre special case — bahut common hai
  if (s.includes("1600")) return 1.6;

  const match = s.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;

  // Metre mein diya hai? ("800m", "1500 mtr")
  const isMetres =
    (s.includes("mtr") || /\d\s*m\b/.test(s)) && !s.includes("km");

  return isMetres && num > 100 ? num / 1000 : num;
};

/** running | walking | cycling */
const activityType = (raw) => {
  const s = String(raw || "").toLowerCase();
  if (s.includes("cycl")) return "cycling";
  if (s.includes("walk")) return "walking";
  return "running";
};

/* ── Time helpers ────────────────────────────────────────── */
const timeToSeconds = (t) => {
  if (!t) return 0;
  const parts = String(t).split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const formatSeconds = (sec) => {
  if (!sec || sec <= 0 || sec >= 999999) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
};

/** Pace = seconds per km. Kam pace = tez. */
const paceOf = (timingSeconds, km) => {
  if (!timingSeconds || timingSeconds >= 999999 || !km || km <= 0) return null;
  return timingSeconds / km;
};

/* ── Main stats builder ──────────────────────────────────────
   submissions: RunSubmission docs (sirf is user ke)
   registrations: Registration docs (populated event ke saath)
*/
const buildStats = ({ submissions = [], registrations = [] }) => {
  // Sirf approved + valid timing wale entries analysis mein aate hain
  const scored = submissions
    .filter((s) => s.status === "approved")
    .map((s) => {
      const km   = parseDistanceKm(s.distance);
      const secs = s.timingSeconds && s.timingSeconds < 999999
        ? s.timingSeconds
        : timeToSeconds(s.timing);

      return {
        eventSlug: s.eventSlug,
        distance:  s.distance,
        km,
        type:      activityType(s.distance),
        timing:    s.timing || "",
        seconds:   secs,
        pace:      paceOf(secs, km),
        at:        s.createdAt,
      };
    })
    .sort((a, b) => new Date(a.at) - new Date(b.at)); // purane se naye

  const timed = scored.filter((s) => s.pace !== null);

  /* ── Totals ── */
  const totalKm = scored.reduce((sum, s) => sum + (s.km || 0), 0);

  const totalMovingSeconds = scored.reduce((sum, s) => sum + (s.seconds || 0), 0);

  /* ── Personal bests — har distance category ka best pace ── */
  const personalBests = {};
  timed.forEach((s) => {
    const key = s.distance;
    if (!personalBests[key] || s.pace < personalBests[key].pace) {
      personalBests[key] = {
        distance:    s.distance,
        km:          s.km,
        timing:      s.timing,
        seconds:     s.seconds,
        pace:        s.pace,
        paceLabel:   `${formatSeconds(s.pace)}/km`,
        eventSlug:   s.eventSlug,
        achievedAt:  s.at,
      };
    }
  });

  const bestOverall = timed.length
    ? timed.reduce((best, s) => (s.pace < best.pace ? s : best))
    : null;

  /* ── Improvement — same activity type ke last do runs ──
     Pace kam hua = tez hue = improvement.
  */
  let improvement = null;
  if (timed.length >= 2) {
    const latest = timed[timed.length - 1];
    const prev = [...timed]
      .slice(0, -1)
      .reverse()
      .find((s) => s.type === latest.type);

    if (prev) {
      const deltaSeconds = prev.pace - latest.pace; // + = tez hue
      const percent = (deltaSeconds / prev.pace) * 100;

      improvement = {
        improved:      deltaSeconds > 0,
        deltaSeconds:  Math.abs(deltaSeconds),
        deltaLabel:    `${formatSeconds(Math.abs(deltaSeconds))}/km`,
        percent:       Math.abs(Number(percent.toFixed(1))),
        from: {
          eventSlug: prev.eventSlug,
          distance:  prev.distance,
          timing:    prev.timing,
          paceLabel: `${formatSeconds(prev.pace)}/km`,
        },
        to: {
          eventSlug: latest.eventSlug,
          distance:  latest.distance,
          timing:    latest.timing,
          paceLabel: `${formatSeconds(latest.pace)}/km`,
        },
      };
    }
  }

  /* ── Next target — best pace se 3% tez ── */
  let nextTarget = null;
  if (bestOverall) {
    const targetPace = bestOverall.pace * 0.97;
    nextTarget = {
      distance:      bestOverall.distance,
      km:            bestOverall.km,
      currentTiming: bestOverall.timing,
      currentPace:   `${formatSeconds(bestOverall.pace)}/km`,
      targetPace:    `${formatSeconds(targetPace)}/km`,
      targetTiming:  formatSeconds(targetPace * bestOverall.km),
      secondsToSave: Math.round(bestOverall.seconds - targetPace * bestOverall.km),
    };
  }

  /* ── Consistency — kitne registered events actually complete kiye ── */
  const totalRegistrations = registrations.length;
  const completionRate = totalRegistrations
    ? Math.round((scored.length / totalRegistrations) * 100)
    : 0;

  /* ── Activity breakdown ── */
  const byType = { running: 0, walking: 0, cycling: 0 };
  scored.forEach((s) => { byType[s.type] = (byType[s.type] || 0) + (s.km || 0); });

  return {
    totalEvents:       totalRegistrations,
    completedEvents:   scored.length,
    pendingReviews:    submissions.filter((s) => s.status === "pending").length,
    completionRate,

    totalKm:           Number(totalKm.toFixed(2)),
    totalTimeLabel:    formatSeconds(totalMovingSeconds),

    bestPaceLabel:     bestOverall ? `${formatSeconds(bestOverall.pace)}/km` : "—",
    bestPaceSeconds:   bestOverall ? Math.round(bestOverall.pace) : null,

    personalBests:     Object.values(personalBests).sort((a, b) => a.km - b.km),
    improvement,
    nextTarget,

    kmByActivity: {
      running: Number((byType.running || 0).toFixed(2)),
      walking: Number((byType.walking || 0).toFixed(2)),
      cycling: Number((byType.cycling || 0).toFixed(2)),
    },

    history: scored.map((s) => ({
      eventSlug: s.eventSlug,
      distance:  s.distance,
      timing:    s.timing || "—",
      paceLabel: s.pace ? `${formatSeconds(s.pace)}/km` : "—",
      at:        s.at,
    })),
  };
};

module.exports = {
  buildStats,
  parseDistanceKm,
  activityType,
  timeToSeconds,
  formatSeconds,
  paceOf,
};

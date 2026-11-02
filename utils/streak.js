/**
 * Streak challenge ka poora hisaab — ek hi jagah.
 *
 * Profile ka calendar, webhook ka tick, admin ki list aur certificate —
 * sab yahin se poochhenge. Alag-alag jagah hisaab karte to ek screen
 * "21 din hue" dikhati aur dusri "20", aur bharosa khatam ho jaata.
 *
 * Tareekh hamesha IST mein, "YYYY-MM-DD" string ke roop mein. Date object
 * ghumane se raat 11 baje ki run agle din gin jaati hai.
 */

const IST = "Asia/Kolkata";

/** Date → "YYYY-MM-DD" (IST mein) */
const dayKey = (d) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: IST });

/** Aaj ka din, IST mein */
const today = () => dayKey(new Date());

/** "YYYY-MM-DD" mein n din jodo */
const addDays = (key, n) => {
  const [y, m, d] = String(key).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

/** Do dinon ke beech kitne din (b - a) */
const daysBetween = (a, b) => {
  const [y1, m1, d1] = String(a).split("-").map(Number);
  const [y2, m2, d2] = String(b).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

/**
 * Window banao.
 * PedalPulse ki tarah default: registration ke AGLE din se shuru.
 */
const buildWindow = ({ startDay, windowDays }) => {
  const windowStart = startDay || addDays(today(), 1);
  return {
    windowStart,
    windowEnd: addDays(windowStart, Math.max(1, windowDays) - 1),
  };
};

/**
 * Ye activity gini jayegi ya nahi?
 * Lautata hai { ok } ya { ok:false, reason } — reason seedha user ko
 * dikhane layak English mein.
 */
const qualifies = (activity, rules = {}) => {
  const {
    minMinutes = 30,
    allowedSports = [],
    outdoorOnly = false,
  } = rules;

  if (!activity) return { ok: false, reason: "No activity data" };

  const minutes = Math.floor((Number(activity.moving_time) || 0) / 60);
  if (minutes < minMinutes) {
    return { ok: false, reason: `Needs ${minMinutes}+ minutes of moving time (this one was ${minutes})` };
  }

  const sport = String(activity.sport_type || activity.type || "");
  if (allowedSports.length && !allowedSports.includes(sport)) {
    return { ok: false, reason: `${sport || "This activity type"} does not count for this challenge` };
  }

  /* Strava trainer/indoor ko alag batata hai. Outdoor-only challenge mein
     treadmill aur indoor trainer nahi chalte. */
  if (outdoorOnly && (activity.trainer === true || activity.type === "VirtualRide" || activity.sport_type === "VirtualRide")) {
    return { ok: false, reason: "Indoor and virtual activities do not count for this challenge" };
  }

  return { ok: true, minutes, sport };
};

/** Activity ka din — user ke apne local time se, UTC se nahi */
const activityDay = (activity) => {
  const local = activity?.start_date_local;
  // start_date_local mein "Z" hota hai par wo asal mein local time hai,
  // isliye seedha kaat lo — timezone dobara mat lagao.
  if (local && typeof local === "string") return local.slice(0, 10);
  return activity?.start_date ? dayKey(activity.start_date) : null;
};

/**
 * Enrollment mein ek din tick karo.
 * Lautata hai { changed, reason } — pehle se tick tha to changed:false.
 *
 * Idempotent hai: wahi activity dobara aaye (Strava edit par aisa hota hai)
 * to kuch nahi badalta.
 */
const markDay = (enrollment, { day, minutes, sport, activityId, source = "strava" }) => {
  if (!day) return { changed: false, reason: "No date on this activity" };

  if (day < enrollment.windowStart) return { changed: false, reason: "Before your window started" };
  if (day > enrollment.windowEnd) return { changed: false, reason: "After your window ended" };

  const days = enrollment.days || [];

  // Wahi activity pehle se gini hui hai?
  if (activityId && days.some((d) => d.activityId && String(d.activityId) === String(activityId))) {
    return { changed: false, reason: "Already counted" };
  }

  // Us din ka tick pehle se hai? Ek date = ek din, chahe 3 activity ho.
  if (days.some((d) => d.date === day)) {
    return { changed: false, reason: "This day is already complete" };
  }

  days.push({ date: day, minutes, sport, activityId: activityId ? String(activityId) : "", source, at: new Date() });
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  enrollment.days = days;

  return { changed: true };
};

/** Strava par activity delete/badal gayi — uska tick hatao */
const unmarkActivity = (enrollment, activityId) => {
  if (!activityId) return { changed: false };
  const before = (enrollment.days || []).length;
  enrollment.days = (enrollment.days || []).filter(
    (d) => String(d.activityId) !== String(activityId)
  );
  return { changed: enrollment.days.length !== before };
};

/**
 * Abhi ki poori haalat.
 * Profile, admin aur certificate — teeno yahi padhenge.
 */
const streakState = (enrollment, now = today()) => {
  const { windowStart, windowEnd, goalDays } = enrollment;
  const days = enrollment.days || [];

  const done = new Set(days.map((d) => d.date));
  const daysDone = done.size;

  const windowDays = daysBetween(windowStart, windowEnd) + 1;
  const allowedMisses = Math.max(0, windowDays - goalDays);

  const started = now >= windowStart;
  const ended = now > windowEnd;

  /* Kitne din abhi bache hain — aaj samet, kyunki aaj ki activity abhi
     ho sakti hai. Window shuru hi nahi hui to poora window bacha hai. */
  const daysLeft = ended
    ? 0
    : started
      ? daysBetween(now, windowEnd) + 1
      : windowDays;

  /* Chhoote hue din: sirf wo jo BEET chuke hain. Aaj ko nahi ginte —
     din abhi khatam nahi hua. */
  const pastDays = !started ? 0 : Math.min(windowDays, daysBetween(windowStart, now) + (ended ? 1 : 0));
  const donePast = days.filter((d) => d.date < now || (ended && d.date <= windowEnd)).length;
  const missed = Math.max(0, pastDays - Math.min(pastDays, donePast));

  const needed = Math.max(0, goalDays - daysDone);

  // Aaj ka tick ho chuka ho to aaj ko dobara nahi gin sakte
  const usableDays = daysLeft - (started && !ended && done.has(now) ? 1 : 0);
  const canStillFinish = needed <= usableDays;

  let status = "upcoming";
  if (daysDone >= goalDays) status = "completed";
  else if (ended) status = "failed";
  else if (!canStillFinish) status = "failed";
  else if (started) status = "active";

  return {
    windowStart,
    windowEnd,
    windowDays,
    goalDays,
    daysDone,
    daysNeeded: needed,
    allowedMisses,
    missesUsed: missed,
    missesLeft: Math.max(0, allowedMisses - missed),
    daysRemaining: daysLeft,
    doneToday: done.has(now),
    started,
    ended,
    canStillFinish,
    status,
    currentStreak: currentStreak(done, now),
    longestStreak: longestStreak(done),
  };
};

/** Aaj (ya kal) se peeche lagatar kitne din */
const currentStreak = (doneSet, now) => {
  let n = 0;
  // Aaj abhi baaki ho sakta hai — to kal se ginna shuru karo
  let cursor = doneSet.has(now) ? now : addDays(now, -1);
  while (doneSet.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
};

/** Poore window mein sabse lamba lagatar silsila */
const longestStreak = (doneSet) => {
  const sorted = [...doneSet].sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
};

/**
 * Calendar ke liye har din ka haal.
 * done | missed | today | future | (window ke bahar kuch nahi)
 */
const dayGrid = (enrollment, now = today()) => {
  const done = new Map((enrollment.days || []).map((d) => [d.date, d]));
  const total = daysBetween(enrollment.windowStart, enrollment.windowEnd) + 1;

  const grid = [];
  for (let i = 0; i < total; i += 1) {
    const date = addDays(enrollment.windowStart, i);
    const hit = done.get(date);

    let status;
    if (hit) status = "done";
    else if (date === now) status = "today";
    else if (date < now) status = "missed";
    else status = "future";

    grid.push({
      date,
      dayNumber: i + 1,
      status,
      minutes: hit?.minutes || 0,
      sport: hit?.sport || "",
      source: hit?.source || "",
    });
  }
  return grid;
};

module.exports = {
  IST, dayKey, today, addDays, daysBetween,
  buildWindow, qualifies, activityDay,
  markDay, unmarkActivity,
  streakState, dayGrid,
};

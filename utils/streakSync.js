const StreakEnrollment = require("../models/StreakEnrollment");
const { qualifies, activityDay, markDay, unmarkActivity, streakState } = require("./streak");

/**
 * Strava se aayi activity → kaun se challenge ka kaun sa din.
 *
 * Ek banda ek saath do streak challenges chala sakta hai, isliye uske
 * saare chalu enrollments par dekhte hain — ek hi activity dono mein
 * gin sakti hai, agar dono ke niyam poore hote hon.
 */

/** Jin challenges par ye activity asar daal sakti hai */
const liveEnrollments = (userId) =>
  StreakEnrollment.find({
    user: userId,
    status: { $in: ["upcoming", "active"] },
  });

/**
 * Activity lagao. Lautata hai: kis-kis challenge mein kya hua.
 * Idempotent — wahi activity dobara aaye to kuch nahi badlta.
 */
const applyActivity = async (userId, activity) => {
  if (!activity?.id) return [];

  const day = activityDay(activity);
  const results = [];

  for (const en of await liveEnrollments(userId)) {
    if (en.source === "manual") continue;   // ye challenge Strava nahi leta

    const check = qualifies(activity, {
      minMinutes:    en.minMinutes,
      allowedSports: en.allowedSports,
      outdoorOnly:   en.outdoorOnly,
    });

    if (!check.ok) {
      results.push({ enrollment: en._id, counted: false, reason: check.reason });
      continue;
    }

    const marked = markDay(en, {
      day,
      minutes:    check.minutes,
      sport:      check.sport,
      activityId: String(activity.id),
      source:     "strava",
    });

    if (marked.changed) {
      refreshStatus(en);
      en.lastSyncAt = new Date();
      await en.save();
    }

    results.push({ enrollment: en._id, counted: marked.changed, reason: marked.reason });
  }

  return results;
};

/**
 * Strava par activity delete ho gayi → us din ka tick hatao.
 * Challenge "completed" ho chuka ho to bhi hataate hain — warna jhooth
 * reh jaata hai. Status dobara ginn kar sahi ho jaata hai.
 */
const removeActivity = async (userId, activityId) => {
  const rows = await StreakEnrollment.find({
    user: userId,
    "days.activityId": String(activityId),
  });

  for (const en of rows) {
    if (unmarkActivity(en, activityId).changed) {
      refreshStatus(en);
      await en.save();
    }
  }
  return rows.length;
};

/** Status dobara ginn kar set karo — ek hi jagah se */
const refreshStatus = (en) => {
  const st = streakState(en);
  en.status = st.status;
  if (st.status === "completed" && !en.completedAt) en.completedAt = new Date();
  if (st.status !== "completed") en.completedAt = null;
  return st;
};

/**
 * Manual proof se din tick karo (Strava ke bina wala raasta).
 * Admin/user dono ke liye ek hi jagah.
 */
const applyManualDay = async (enrollment, { day, minutes, sport, proofUrl }) => {
  if (enrollment.source === "strava") {
    return { ok: false, reason: "This challenge only counts Strava activities" };
  }
  if (minutes < enrollment.minMinutes) {
    return { ok: false, reason: `Needs ${enrollment.minMinutes}+ minutes` };
  }

  const marked = markDay(enrollment, { day, minutes, sport, source: "manual" });
  if (!marked.changed) return { ok: false, reason: marked.reason };

  const last = enrollment.days[enrollment.days.length - 1];
  if (last && proofUrl) last.proofUrl = proofUrl;

  refreshStatus(enrollment);
  await enrollment.save();
  return { ok: true };
};

module.exports = { applyActivity, removeActivity, applyManualDay, refreshStatus };

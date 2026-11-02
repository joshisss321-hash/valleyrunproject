const StreakEnrollment = require("../models/StreakEnrollment");
const { buildWindow, today, addDays } = require("./streak");

/**
 * Streak event ki registration poori hui → enrollment bana do.
 *
 * Jaan-bujh kar payment ke raaste se alag rakha hai: ye completeRegistration
 * ke aakhir mein chalta hai aur fail ho jaye to bhi registration nahi tootti.
 * Paisa kat chuka hai — enrollment baad mein bhi ban sakti hai, par
 * registration ka gum ho jaana maaf nahi.
 *
 * Idempotent: dobara chalane par nayi enrollment nahi banti.
 */
const createStreakEnrollment = async ({ user, event, registration, optionLabel }) => {
  if (!event || event.challengeType !== "streak") return null;

  const existing = await StreakEnrollment.findOne({ user: user._id, event: event._id });
  if (existing) return existing;

  /* User ne jo option chuna (registration ki `category` mein aata hai).
     Na mile to pehla option — enrollment banna zaroori hai, warna banda
     paise dekar bhi challenge shuru nahi kar paayega. */
  const options = event.streakOptions || [];
  const chosen =
    options.find((o) => o.label === optionLabel) ||
    options[0] ||
    { label: "21 of 24", goalDays: 21, windowDays: 24 };

  /* Window registration ke AGLE din se — taaki poora pehla din mile.
     Aaj register karke aaj hi "ek din chhoot gaya" dikhna bura lagta hai. */
  const { windowStart, windowEnd } = buildWindow({
    startDay: addDays(today(), 1),
    windowDays: chosen.windowDays,
  });

  return StreakEnrollment.create({
    user:         user._id,
    event:        event._id,
    registration: registration?._id || null,
    eventSlug:    event.slug,

    windowStart,
    windowEnd,
    goalDays:    chosen.goalDays,
    optionLabel: chosen.label,

    // Niyam abhi ke copy — admin baad mein badle to chalu challenge na hile
    minMinutes:    event.streakMinMinutes  ?? 30,
    allowedSports: event.streakSports?.length ? event.streakSports : ["Run", "Walk", "Ride", "Hike"],
    outdoorOnly:   event.streakOutdoorOnly ?? true,
    source:        event.streakSource      || "both",

    status: "upcoming",
  });
};

module.exports = { createStreakEnrollment };

const mongoose = require("mongoose");

/* Ek runner ka ek streak challenge.
   Window har bande ka apna hota hai — registration ke agle din se — isliye
   ye event par nahi, enrollment par rehta hai.

   Tareekh "YYYY-MM-DD" (IST) string hai, Date object nahi. Date object
   ghumane se raat 11 baje ki run agle din gin jaati — aur streak jhooth-much
   toot jaati. */
const streakEnrollmentSchema = new mongoose.Schema(
  {
    user:         { type: mongoose.Schema.Types.ObjectId, ref: "User",  required: true },
    event:        { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    registration: { type: mongoose.Schema.Types.ObjectId, ref: "Registration", default: null },
    eventSlug:    { type: String, default: "" },

    /* ── Window — user ne jo chuna ── */
    windowStart: { type: String, required: true },   // "2026-11-03"
    windowEnd:   { type: String, required: true },
    goalDays:    { type: Number, required: true },   // 21
    optionLabel: { type: String, default: "" },      // "21 of 24"

    /* ── Niyam, enrollment ke waqt ke ──
       Jaan-bujh kar yahan copy kiye hain. Admin baad mein event ke niyam
       badle to jo log pehle se chal rahe hain unka challenge na badle. */
    minMinutes:    { type: Number, default: 30 },
    allowedSports: { type: [String], default: ["Run", "Walk", "Ride", "Hike"] },
    outdoorOnly:   { type: Boolean, default: true },
    source:        { type: String, enum: ["strava", "manual", "both"], default: "both" },

    /* ── Jo din poore hue ──
       Ek date ek hi baar. activityId se duplicate rukta hai. */
    days: {
      type: [{
        _id:        false,
        date:       { type: String, required: true },   // "2026-11-05"
        minutes:    { type: Number, default: 0 },
        sport:      { type: String, default: "" },
        activityId: { type: String, default: "" },
        source:     { type: String, default: "strava" }, // strava | manual
        proofUrl:   { type: String, default: "" },       // manual upload ke liye
        at:         { type: Date, default: Date.now },
      }],
      default: [],
    },

    status: {
      type: String,
      enum: ["upcoming", "active", "completed", "failed"],
      default: "upcoming",
    },

    completedAt:       { type: Date, default: null },
    certificateSentAt: { type: Date, default: null },
    lastSyncAt:        { type: Date, default: null },
  },
  { timestamps: true }
);

// Ek runner, ek event, ek hi enrollment
streakEnrollmentSchema.index({ user: 1, event: 1 }, { unique: true });
// Webhook aane par chalu enrollments dhoondhne ke liye
streakEnrollmentSchema.index({ user: 1, status: 1 });
streakEnrollmentSchema.index({ status: 1, windowEnd: 1 });

module.exports = mongoose.model("StreakEnrollment", streakEnrollmentSchema);

const mongoose = require("mongoose");

// "1:23:45" → seconds (for leaderboard sorting)
function timeToSeconds(t) {
  if (!t) return 999999;
  const p = t.split(":").map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return 999999;
}

const RunSubmissionSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, lowercase: true, trim: true },
    phone:    { type: String, required: true, trim: true },

    // ✅ FIX 1: eventSlug — har event ka data alag
    eventSlug: { type: String, required: true, default: "" },

    distance: { type: String, required: true }, // "5km","10km","21km"

    // ✅ NEW: timing for leaderboard auto-sort
    timing:        { type: String,  default: "" },   // "1:23:45"
    timingSeconds: { type: Number,  default: 999999 }, // auto-calculated

    // ✅ FIX 2: imageUrl (was saving as "image" before)
    imageUrl: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    adminNote: { type: String, default: "" },
  },
  { timestamps: true }
);

// Auto-calculate timingSeconds
RunSubmissionSchema.pre("save", function (next) {
  if (this.timing) this.timingSeconds = timeToSeconds(this.timing);
  next();
});

// Indexes
RunSubmissionSchema.index({ eventSlug: 1, distance: 1, timingSeconds: 1 });
RunSubmissionSchema.index({ eventSlug: 1, status: 1 });
RunSubmissionSchema.index({ email: 1, eventSlug: 1 }, { unique: true }); // ✅ one submission per event per user

module.exports = mongoose.model("RunSubmission", RunSubmissionSchema);

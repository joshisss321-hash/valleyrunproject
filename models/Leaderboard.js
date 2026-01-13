const mongoose = require("mongoose");

const leaderboardSchema = new mongoose.Schema(
  {
    eventSlug: { type: String, required: true },
    name: { type: String, required: true },
    category: String,
    distance: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Leaderboard", leaderboardSchema);

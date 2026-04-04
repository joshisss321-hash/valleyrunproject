const mongoose = require("mongoose");

const MedalReviewSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  instaId:  { type: String, required: true },
  review:   { type: String, required: true },
  imageUrl: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("MedalReview", MedalReviewSchema);
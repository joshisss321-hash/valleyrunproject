const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  review:   { type: String, required: true, trim: true },
  imageUrl: { type: String, required: true },
  rating:   { type: Number, default: 5, min: 1, max: 5 },
  active:   { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("Review", reviewSchema);
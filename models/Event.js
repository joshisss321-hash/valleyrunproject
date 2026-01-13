const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: String,
    slug: { type: String, unique: true },
    description: String,
    dates: String,
    price: { type: Number, default: 349 },

    // 🔹 IMAGES (SEPARATE PURPOSE)
    heroImage: String,     // hero section background
    coverImage: String,    // challenge card image
    medalImage: String,    // medal preview
    gallery: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);

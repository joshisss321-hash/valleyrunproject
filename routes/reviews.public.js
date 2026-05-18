const express = require("express");
const router  = express.Router();
const Review  = require("../models/Review");

// GET /api/reviews — public, only active
router.get("/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ active: true }).sort({ createdAt: -1 });
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
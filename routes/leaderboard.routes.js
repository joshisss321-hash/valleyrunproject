const express = require("express");
const Leaderboard = require("../models/Leaderboard");

const router = express.Router();

/* ===============================
   GET LEADERBOARD BY EVENT SLUG
================================ */
router.get("/:slug", async (req, res) => {
  try {
    const rows = await Leaderboard.find({
      eventSlug: req.params.slug,
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      rows, // 👈 यही frontend expect करता है
    });
  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load leaderboard",
    });
  }
});

module.exports = router;

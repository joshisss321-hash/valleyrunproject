const express       = require("express");
const router        = express.Router();
const RunSubmission = require("../models/RunSubmission");

// GET /api/leaderboard/:slug
router.get("/:slug", async (req, res) => {
  try {
    const { slug }     = req.params;
    const { distance } = req.query;

    const filter = {
      eventSlug: slug,
      status:    "approved",
    };
    if (distance) filter.distance = distance;

    const entries = await RunSubmission.find(filter)
      .sort({ timingSeconds: 1 })
      .lean();

    const ranked = entries.map((e, i) => ({
      rank:          i + 1,
      name:          e.name,
      distance:      e.distance,
      timing:        e.timing || "—",
      timingSeconds: e.timingSeconds,
    }));

    res.json({ success: true, entries: ranked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
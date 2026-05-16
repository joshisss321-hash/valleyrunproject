const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const Registration = require("../models/Registration");
const RunSubmission = require("../models/RunSubmission");
const User  = require("../models/User");
const Event = require("../models/Event");

// GET /api/admin/stats
router.get("/stats", protect, async (req, res) => {
  try {
    const [totalRegs, totalUsers, totalEvents, pendingSubs, approvedSubs] = await Promise.all([
      Registration.countDocuments(),
      User.countDocuments(),
      Event.countDocuments({ active: true }),
      RunSubmission.countDocuments({ status: "pending" }),
      RunSubmission.countDocuments({ status: "approved" }),
    ]);

    // Revenue
    const revResult = await Registration.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalRevenue = revResult[0]?.total || 0;

    // Per-event stats
    const events = await Event.find({}, "title slug").lean();
    const eventStats = await Promise.all(
      events.map(async (ev) => ({
        title: ev.title,
        slug:  ev.slug,
        registrations: await Registration.countDocuments({ eventSlug: ev.slug }),
        pendingSubmissions: await RunSubmission.countDocuments({ eventSlug: ev.slug, status: "pending" }),
      }))
    );

    // Last 7 days registrations
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyRegs = await Registration.countDocuments({ createdAt: { $gte: weekAgo } });

    // Daily chart
    const dailyChart = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end   = new Date(d.setHours(23, 59, 59, 999));
      const count = await Registration.countDocuments({ createdAt: { $gte: start, $lte: end } });
      dailyChart.push({
        day: start.toLocaleDateString("en-IN", { weekday: "short" }),
        count,
      });
    }

    res.json({
      success: true,
      stats: {
        totalRegs,
        totalUsers,
        totalEvents,
        pendingSubs,
        approvedSubs,
        totalRevenue,
        weeklyRegs,
        dailyChart,
        eventStats,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

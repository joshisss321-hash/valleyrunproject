const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/auth");
const RunSubmission = require("../models/RunSubmission");

// GET /api/admin/submissions?eventSlug=xxx&status=pending&distance=5km&search=xxx
router.get("/", protect, async (req, res) => {
  try {
    const { eventSlug, status, distance, search, page = 1, limit = 100 } = req.query;

    const filter = {};
    if (eventSlug) filter.eventSlug = eventSlug;
    if (status)    filter.status    = status;
    if (distance)  filter.distance  = distance;
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const evFilter = eventSlug ? { eventSlug } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [submissions, total, pending, approved, rejected] = await Promise.all([
      RunSubmission.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      RunSubmission.countDocuments(filter),
      RunSubmission.countDocuments({ ...evFilter, status: "pending" }),
      RunSubmission.countDocuments({ ...evFilter, status: "approved" }),
      RunSubmission.countDocuments({ ...evFilter, status: "rejected" }),
    ]);

    res.json({
      success: true,
      submissions,
      total,
      counts: { pending, approved, rejected },
      pagination: {
        page: +page, limit: +limit,
        totalPages: Math.ceil(total / +limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/submissions/:id/approve
router.put("/:id/approve", protect, async (req, res) => {
  try {
    const sub = await RunSubmission.findByIdAndUpdate(
      req.params.id, { status: "approved" }, { new: true }
    );
    if (!sub) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, submission: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/submissions/:id/reject
router.put("/:id/reject", protect, async (req, res) => {
  try {
    const sub = await RunSubmission.findByIdAndUpdate(
      req.params.id, { status: "rejected" }, { new: true }
    );
    if (!sub) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, submission: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/submissions/bulk-approve  { ids: ["id1","id2"] }
router.put("/bulk-approve", protect, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ success: false, message: "No IDs" });
    const result = await RunSubmission.updateMany(
      { _id: { $in: ids } }, { status: "approved" }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/submissions/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    await RunSubmission.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

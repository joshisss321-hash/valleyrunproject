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

/* GET /api/admin/submissions/export?eventSlug=&status=&distance=&search=
   Excel download ke liye — list endpoint jaisa hi filter, par
   pagination NAHI. Screen par bhale 100 dikhein, sheet mein poore
   records aate hain. */
router.get("/export", protect, async (req, res) => {
  try {
    const { eventSlug, status, distance, search } = req.query;

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

    const subs = await RunSubmission.find(filter).sort({ createdAt: 1 }).lean();

    const rows = subs.map((s, i) => ({
      sr:        i + 1,
      name:      s.name      || "",
      email:     s.email     || "",
      phone:     s.phone     || "",
      eventSlug: s.eventSlug || "",
      distance:  s.distance  || "",
      timing:    s.timing    || "",
      status:    s.status    || "",
      adminNote: s.adminNote || "",
      imageUrl:  s.imageUrl  || "",
      date: s.createdAt
        ? new Date(s.createdAt).toLocaleDateString("en-IN")
        : "",
    }));

    res.json({
      success: true,
      event:   eventSlug || "all-events",
      total:   rows.length,
      rows,
    });
  } catch (err) {
    console.error("submissions export error:", err);
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

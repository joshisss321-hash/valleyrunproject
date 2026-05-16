const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const { protect } = require("../middleware/auth");
const Event        = require("../models/Event");
const Registration = require("../models/Registration");
const { uploadToCloudinary } = require("../utils/cloudinary");

const storage = multer.memoryStorage();
const upload  = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/admin/events
router.get("/", protect, async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 }).lean();
    const withCounts = await Promise.all(
      events.map(async (ev) => ({
        ...ev,
        registrationCount: await Registration.countDocuments({ event: ev._id }),
      }))
    );
    res.json({ success: true, events: withCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/events/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Not found" });
    const registrationCount = await Registration.countDocuments({ event: event._id });
    res.json({ success: true, event, registrationCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/events — Create
router.post("/", protect, async (req, res) => {
  try {
    const existing = await Event.findOne({ slug: req.body.slug });
    if (existing) return res.status(400).json({ success: false, message: "Slug already taken" });
    const event = await Event.create(req.body);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/events/:id — Update
router.put("/:id", protect, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!event) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/events/:id
router.delete("/:id", protect, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Event deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/events/upload-image — Upload any image to Cloudinary
// body: multipart with field "image" + query ?type=heroImage|coverImage|medalImage|medalImageBack|gallery
router.post("/upload-image", protect, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file" });
    const type   = req.query.type || "general";
    const folder = `valleyrun/events/${type}`;
    const url    = await uploadToCloudinary(req.file.buffer, folder);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/events/:id/gallery/add  { imageUrl }
router.patch("/:id/gallery/add", protect, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $push: { gallery: req.body.imageUrl } },
      { new: true }
    );
    res.json({ success: true, gallery: event.gallery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/events/:id/gallery/remove  { imageUrl }
router.patch("/:id/gallery/remove", protect, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $pull: { gallery: req.body.imageUrl } },
      { new: true }
    );
    res.json({ success: true, gallery: event.gallery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

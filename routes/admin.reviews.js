const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const fs       = require("fs");
const ImageKit = require("imagekit");
const Review   = require("../models/Review");
const { protect } = require("../middleware/auth");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const upload = multer({ dest: "uploads/" });

// GET all reviews (admin)
router.get("/", protect, async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST add review with image upload
router.post("/", protect, upload.single("image"), async (req, res) => {
  const cleanup = () => {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  };

  try {
    const { name, review, rating } = req.body;

    if (!name || !review) {
      cleanup();
      return res.status(400).json({ success: false, message: "Name and review required" });
    }

    let imageUrl = req.body.imageUrl || "";

    // Upload image if file provided
    if (req.file) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const result = await imagekit.upload({
        file:     fileBuffer,
        fileName: `review_${Date.now()}.jpg`,
        folder:   "/valleyrun/reviews",
      });
      imageUrl = result.url;
      cleanup();
    }

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "Image required" });
    }

    const r = await Review.create({ name, review, imageUrl, rating: Number(rating) || 5 });
    res.status(201).json({ success: true, review: r });
  } catch (err) {
    cleanup();
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH toggle active
router.patch("/:id/toggle", protect, async (req, res) => {
  try {
    const r = await Review.findById(req.params.id);
    if (!r) return res.status(404).json({ success: false, message: "Not found" });
    r.active = !r.active;
    await r.save();
    res.json({ success: true, review: r });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE review
router.delete("/:id", protect, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
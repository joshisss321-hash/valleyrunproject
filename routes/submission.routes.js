const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

const RunSubmission = require("../models/RunSubmission");
const User = require("../models/User");

// multer temp storage
const upload = multer({ dest: "uploads/" });


// 🔍 SEARCH RUNNER
router.post("/search-runner", async (req, res) => {
  try {
    const { query } = req.body;

    const runner = await User.findOne({
      $or: [{ email: query }, { phone: query }]
    });

    if (!runner) {
      return res.json({ runner: null });
    }

    res.json({ runner });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});


// 📤 SUBMIT RUN (FIXED + PRO VERSION 🔥)
router.post("/submit-run", upload.single("image"), async (req, res) => {
  try {
    const { name, email, phone, distance, eventSlug } = req.body;

    if (!eventSlug) {
      return res.status(400).json({ error: "Event missing" });
    }

    // 🔥 event-wise duplicate check
    const existing = await RunSubmission.findOne({ email, eventSlug });

    if (existing) {
      return res.status(400).json({
        error: "You already submitted for this event"
      });
    }

    let imageUrl = "";

    // upload image
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path);
      imageUrl = result.secure_url;

      fs.unlinkSync(req.file.path);
    }

    // 🔥 SAVE WITH EVENT
    await RunSubmission.create({
      name,
      email,
      phone,
      distance: Number(distance),
      image: imageUrl,
      eventSlug // ⭐ MOST IMPORTANT
    });

    res.json({
      success: true,
      message: "Submitted successfully"
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const fs = require("fs");

const RunSubmission = require("../models/RunSubmission");
const User = require("../models/User");

// multer temp storage
const upload = multer({ dest: "uploads/" });


// 🔍 Search Runner (FIXED)
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


// 📤 Submit Run (CLOUDINARY)
router.post("/submit-run", upload.single("image"), async (req, res) => {
  try {
    const { name, email, phone, distance } = req.body;

    // duplicate check
    const existing = await RunSubmission.findOne({ email });

    if (existing) {
      return res.status(400).json({
        error: "You already submitted activity"
      });
    }

    let imageUrl = "";

    // 🔥 Upload to Cloudinary
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path);
      imageUrl = result.secure_url;

      // temp file delete
      fs.unlinkSync(req.file.path);
    }

    await RunSubmission.create({
      name,
      email,
      phone,
      distance,
      image: imageUrl
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
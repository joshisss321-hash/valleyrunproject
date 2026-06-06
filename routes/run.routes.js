const express   = require("express");
const router    = express.Router();
const multer    = require("multer");
const fs        = require("fs");
const imagekit  = require("../config/cloudinary"); // same import
const RunSubmission = require("../models/RunSubmission");
const Registration  = require("../models/Registration");
const User          = require("../models/User");

const upload  = multer({ dest: "uploads/" });
const cleanup = (file) => {
  if (file && fs.existsSync(file.path)) {
    try { fs.unlinkSync(file.path); } catch {}
  }
};

// POST /api/search-runner
router.post("/search-runner", async (req, res) => {
  try {
    const { query, eventSlug } = req.body;
    if (!query) return res.json({ runner: null });

    const q = query.trim();

    // ✅ Pehle registration dhundho — eventSlug ke saath
    const registration = await Registration.findOne({
      eventSlug: eventSlug,  // ✅ event check
      $or: [
        { phone: q },
        { email: q.toLowerCase() },
        { orderId: q },
        { paymentId: q },
      ],
    }).populate("user");

    if (!registration) {
      return res.json({ 
        runner: null, 
        message: "No registration found for this event" 
      });
    }

    const user = registration.user;
    if (!user) return res.json({ runner: null });

    const alreadySubmitted = await RunSubmission.findOne({
      email: user.email,
      eventSlug: eventSlug,
    });

    res.json({
      runner: {
        name:  user.name,
        email: user.email,
        phone: user.phone,
        city:  user.city  || "",
        state: user.state || "",
      },
      alreadySubmitted: !!alreadySubmitted,
      submissionStatus: alreadySubmitted?.status || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/submit-run
router.post("/submit-run", upload.single("image"), async (req, res) => {
  try {
    const { name, email, phone, distance, timing, eventSlug } = req.body;

    if (!name || !email || !distance || !eventSlug) {
      cleanup(req.file);
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Screenshot is required" });
    }

    // Duplicate check per event
    const existing = await RunSubmission.findOne({
      email: email.toLowerCase(),
      eventSlug,
    });
    if (existing) {
      cleanup(req.file);
      return res.status(400).json({
        error: existing.status === "approved"
          ? "Tumhari activity already verify ho gayi hai! ✅"
          : "Already submitted for this event. Pending verification.",
      });
    }

    // ✅ Upload to ImageKit
    const sharp = require("sharp");
const fileBuffer = await sharp(req.file.path)
  .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 70 })
  .toBuffer();
    const uploaded = await imagekit.upload({
      file:     fileBuffer,
      fileName: `${Date.now()}.jpg`,
      folder:   `/valleyrun/submissions/${eventSlug}`,
    });
    cleanup(req.file);

    await RunSubmission.create({
      name:      name.trim(),
      email:     email.toLowerCase().trim(),
      phone:     phone?.trim() || "",
      distance,
      timing:    timing || "",
      eventSlug,
      imageUrl:  uploaded.url,
      status:    "pending",
    });

    res.json({ success: true, message: "Submitted! We will verify within 24 hours. 🎉" });

  } catch (err) {
    cleanup(req.file);
    console.error("submit-run error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

module.exports = router;
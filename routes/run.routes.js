const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const cloudinary    = require("../config/cloudinary");
const fs            = require("fs");
const RunSubmission = require("../models/RunSubmission");
const Registration  = require("../models/Registration");
const User          = require("../models/User");

const upload = multer({ dest: "uploads/" });

const cleanup = (file) => {
  if (file && fs.existsSync(file.path)) {
    try { fs.unlinkSync(file.path); } catch {}
  }
};

// ─── POST /api/search-runner ──────────────────────────────────────────────────
// Search by phone, email, or orderId
router.post("/search-runner", async (req, res) => {
  try {
    const { query, eventSlug } = req.body;
    if (!query) return res.json({ runner: null });

    const q = query.trim();

    // Find user by email or phone
    let user = await User.findOne({
      $or: [
        { email: q.toLowerCase() },
        { phone: q },
      ],
    });

    // If not found by user, try orderId/paymentId in Registration
    if (!user) {
      const regByOrder = await Registration.findOne({
        $or: [{ orderId: q }, { paymentId: q }],
        ...(eventSlug ? { eventSlug } : {}),
      }).populate("user");

      if (regByOrder) user = regByOrder.user;
    }

    if (!user) {
      return res.json({ runner: null, message: "No registration found" });
    }

    // Check if already submitted for this specific event
    const eventFilter = eventSlug ? { eventSlug } : {};
    const alreadySubmitted = await RunSubmission.findOne({
      email: user.email,
      ...eventFilter,
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
    console.error("search-runner error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/submit-run ─────────────────────────────────────────────────────
// FormData: name, email, phone, distance, timing, eventSlug, image
router.post("/submit-run", upload.single("image"), async (req, res) => {
  try {
    const { name, email, phone, distance, timing, eventSlug } = req.body;

    // ✅ Validate required fields
    if (!name || !email || !distance || !eventSlug) {
      cleanup(req.file);
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Screenshot is required" });
    }

    // ✅ FIX: Duplicate check PER EVENT (not global)
    const existing = await RunSubmission.findOne({
      email: email.toLowerCase(),
      eventSlug,
    });

    if (existing) {
      cleanup(req.file);
      const msg =
        existing.status === "approved"
          ? "Your activity for this event is already verified! ✅"
          : "You have already submitted for this event. Pending verification.";
      return res.status(400).json({ error: msg });
    }

    // ✅ Upload to Cloudinary — event-wise folder
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder:       `valleyrun/submissions/${eventSlug}`,
      quality:      "auto",
      fetch_format: "auto",
    });
    cleanup(req.file);

    // ✅ FIX: Save with correct field names (imageUrl, eventSlug, timing)
    await RunSubmission.create({
      name:      name.trim(),
      email:     email.toLowerCase().trim(),
      phone:     phone?.trim() || "",
      distance,
      timing:    timing || "",
      eventSlug,
      imageUrl:  result.secure_url, // ✅ was saving as "image" before — fixed
      status:    "pending",
    });

    res.json({
      success: true,
      message: "Activity submitted! We will verify within 24 hours. 🎉",
    });

  } catch (err) {
    cleanup(req.file);
    console.error("submit-run error:", err);
    res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ─── GET /api/leaderboard/:eventSlug ─────────────────────────────────────────
// Public leaderboard — approved submissions sorted by timing
router.get("/leaderboard/:eventSlug", async (req, res) => {
  try {
    const { eventSlug } = req.params;
    const { distance }  = req.query;

    const filter = { eventSlug, status: "approved" };
    if (distance) filter.distance = distance;

    const entries = await RunSubmission.find(filter)
      .sort({ timingSeconds: 1 }) // ✅ fastest first
      .limit(200)
      .select("name distance timing timingSeconds city state createdAt");

    // Add rank
    const ranked = entries.map((e, i) => ({
      rank:     i + 1,
      name:     e.name,
      distance: e.distance,
      timing:   e.timing || "—",
      city:     e.city   || "",
      state:    e.state  || "",
    }));

    res.json({ success: true, entries: ranked });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

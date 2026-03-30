const router = require("express").Router();

const RunSubmission = require("../models/RunSubmission");
const Leaderboard = require("../models/Leaderboard");

// GET
router.get("/", async (req, res) => {
  const data = await RunSubmission.find().sort({ createdAt: -1 });
  res.json({ data });
});

// APPROVE
router.put("/approve/:id", async (req, res) => {
  const sub = await RunSubmission.findById(req.params.id);

  sub.status = "approved";
  await sub.save();

  // 🔥 AUTO LEADERBOARD
  await Leaderboard.create({
    name: sub.name,
    distance: sub.distance,
    eventSlug: sub.eventSlug
  });

  res.json({ success: true });
});

// REJECT
router.put("/reject/:id", async (req, res) => {
  await RunSubmission.findByIdAndUpdate(req.params.id, {
    status: "rejected"
  });

  res.json({ success: true });
});

// CERTIFICATE
router.put("/certificate/:id", async (req, res) => {
  await RunSubmission.findByIdAndUpdate(req.params.id, {
    certificateSent: true
  });

  res.json({ success: true });
});

module.exports = router;
const Leaderboard = require("../models/leaderboard");

/* ===============================
   CREATE ENTRY (ADMIN)
================================ */
exports.createEntry = async (req, res) => {
  try {
    const entry = await Leaderboard.create(req.body);
    res.json({ success: true, entry });
  } catch (err) {
    res.status(500).json({ success: false, message: "Create failed" });
  }
};

/* ===============================
   GET BY EVENT (PUBLIC)
================================ */
exports.getByEvent = async (req, res) => {
  try {
    const list = await Leaderboard.find({
      event: req.params.eventId,
    }).sort({ rank: 1 });

    res.json({ success: true, list });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* ===============================
   UPDATE ENTRY (ADMIN)
================================ */
exports.updateEntry = async (req, res) => {
  try {
    const updated = await Leaderboard.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({ success: true, entry: updated });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* ===============================
   DELETE ENTRY (ADMIN)
================================ */
exports.deleteEntry = async (req, res) => {
  try {
    await Leaderboard.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
};

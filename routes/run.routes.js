const express = require("express");
const router = express.Router();

const RunSubmission = require("../models/RunSubmission");
const Registration = require("../models/Registration");


// 🔍 Search Runner
router.post("/search-runner", async (req, res) => {
  try {
    const { query } = req.body;

    const runner = await Registration.findOne({
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


// 📤 Submit Run
router.post("/submit-run", async (req, res) => {
  try {
    const { name, email, phone, distance } = req.body;

    // duplicate check
    const existing = await RunSubmission.findOne({ email });

    if (existing) {
      return res.status(400).json({
        error: "You already submitted activity"
      });
    }

    await RunSubmission.create({
      name,
      email,
      phone,
      distance
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
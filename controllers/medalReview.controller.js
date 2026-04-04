const MedalReview = require("../models/MedalReview");
const cloudinary = require("../config/cloudinary"); // ✅ same as run.routes.js
const fs = require("fs");

const submitMedalReview = async (req, res) => {
  try {
    const { name, instaId, review } = req.body;
    const file = req.file;

    // Validation
    if (!name || !instaId || !review || !file) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(file.path);
    const imageUrl = result.secure_url;

    // Delete temp file
    fs.unlinkSync(file.path);

    // Save to DB
    await MedalReview.create({
      name,
      instaId,
      review,
      imageUrl,
    });

    res.json({ success: true, message: "Review submitted successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server Error" });
  }
};

module.exports = { submitMedalReview };
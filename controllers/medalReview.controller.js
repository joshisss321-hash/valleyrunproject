const MedalReview = require("../models/MedalReview");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Direct config — no dependency on config/cloudinary.js
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key:    process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const submitMedalReview = async (req, res) => {
  try {
    const { name, instaId, review } = req.body;
    const file = req.file;

    // Validation
    if (!name || !instaId || !review || !file) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: "medal-reviews"
    });
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
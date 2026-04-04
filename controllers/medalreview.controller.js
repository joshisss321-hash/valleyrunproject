const MedalReview = require("../models/MedalReview");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const submitMedalReview = async (req, res) => {
  try {
    const { name, instaId, review } = req.body;
    const file = req.file;

    // Validation
    if (!name || !instaId || !review || !file) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Upload image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "medal-reviews" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(file.buffer);
    });

    // Save to DB
    await MedalReview.create({
      name,
      instaId,
      review,
      imageUrl: uploadResult.secure_url,
    });

    res.json({ success: true, message: "Review submitted successfully" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server Error" });
  }
};

module.exports = { submitMedalReview };
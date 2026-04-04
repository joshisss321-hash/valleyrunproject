import mongoose from "mongoose";

const MedalReviewSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  instaId:  { type: String, required: true },
  review:   { type: String, required: true },
  imageUrl: { type: String, required: true }, // Cloudinary URL
}, { timestamps: true });

export default mongoose.models.MedalReview ||
  mongoose.model("MedalReview", MedalReviewSchema);

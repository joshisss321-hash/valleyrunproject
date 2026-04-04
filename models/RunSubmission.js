// const mongoose = require("mongoose");

// const schema = new mongoose.Schema({
//   name: String,
//   email: String,
//   phone: String,
//   distance: String,
//    image: String,
//   status: {
//     type: String,
//     default: "pending"
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// });

// module.exports = mongoose.model("RunSubmission", schema);

import mongoose from "mongoose";

const RunSubmissionSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true },
  phone:    { type: String, required: true },
  distance: { type: String, required: true },
  imageUrl: { type: String, required: true },  // Cloudinary image URL
}, { timestamps: true });

export default mongoose.models.RunSubmission ||
  mongoose.model("RunSubmission", RunSubmissionSchema);

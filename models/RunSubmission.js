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

const mongoose = require("mongoose");

const RunSubmissionSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true },
  phone:    { type: String, required: true },
  distance: { type: String, required: true },
  imageUrl: { type: String, required: true },
  status:   { type: String, default: "pending" },
}, { timestamps: true });

module.exports = mongoose.model("RunSubmission", RunSubmissionSchema);

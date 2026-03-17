const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  distance: String,
   image: String,
  status: {
    type: String,
    default: "pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("RunSubmission", schema);
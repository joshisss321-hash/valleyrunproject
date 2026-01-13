const mongoose = require("mongoose");

module.exports = async () => {
  try {
    console.log("Mongo URI:", process.env.MONGO_URI); // DEBUG
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error", err);
    process.exit(1);
  }
};

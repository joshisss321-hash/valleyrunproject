const mongoose = require("mongoose");

module.exports = async () => {
  try {
    // Support both spellings — production uses MONGO_URI, local .env has MONGODB_URI
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (!uri) {
      console.error("❌ MONGO_URI (or MONGODB_URI) missing in environment");
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error", err);
    process.exit(1);
  }
};

// const app = require("./app");
// const connectDB = require("./config/db");

// connectDB();

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`✅ Server running on port ${PORT}`);
// });
const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

// 🔑 IMPORTANT: start server ONLY after DB connects
connectDB()
  .then(() => {
    console.log("✅ MongoDB connected");

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

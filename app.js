const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const paymentRoutes = require("./routes/payment.routes");
const registrationRoutes = require("./routes/registration.routes");
const adminRoutes = require("./routes/admin.routes");
const eventRoutes = require("./routes/event.routes");
const leaderboardRoutes = require("./routes/leaderboard.routes");

const app = express();

/* ===============================
   CORS — LIVE DOMAIN FIX
================================ */
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://valleyrun.in",
      "https://www.valleyrun.in",
      "https://valleyrun.vercel.app",
      "https://frontendvalley-run-project-36s2.vercel.app",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

/* ===============================
   BODY PARSERS
================================ */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.send("Valley Run API running ✅");
});

/* ===============================
   ROUTES
================================ */
app.use("/api/payment", paymentRoutes);
app.use("/api/register", registrationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

/* ===============================
   404 HANDLER
================================ */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

module.exports = app;

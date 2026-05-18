const express = require("express");
const cors    = require("cors");
const dotenv  = require("dotenv");

dotenv.config();

const paymentRoutes      = require("./routes/payment.routes");
const registrationRoutes = require("./routes/registration.routes");
const adminRoutes        = require("./routes/admin.routes");
const eventRoutes        = require("./routes/event.routes");
const adminLeaderboard   = require("./routes/admin.leaderboard");
const runRoutes          = require("./routes/run.routes");
const webhookRoutes      = require("./routes/webhook");
const adminUsers         = require("./routes/admin.users");
const adminEvents        = require("./routes/admin.events");
const adminSubmissions   = require("./routes/admin.submissions");
const adminStats         = require("./routes/admin.stats");
const adminRegistrations = require("./routes/admin.registrations");
const medalReviewRoutes  = require("./routes/medalReview.routes");
const leaderboardRoutes  = require("./routes/leaderboard.routes"); // ✅ NEW
const adminReviews  = require("./routes/admin.reviews");
const publicReviews = require("./routes/reviews.public");

const app = express();

/* ── CORS ── */
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://valleyrun.in",
      "https://www.valleyrun.in",
      "https://valleyrun.vercel.app",
      "https://frontendvalley-run-project-36s2.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

/* ── WEBHOOK — MUST be before json parser ── */
app.use("/api", webhookRoutes);

/* ── BODY PARSERS ── */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ── HEALTH ── */
app.get("/", (_req, res) => res.send("Valley Run API ✅"));

/* ── PUBLIC ── */
app.use("/api/payment",     paymentRoutes);
app.use("/api/register",    registrationRoutes);
app.use("/api/events",      eventRoutes);
app.use("/api/leaderboard", leaderboardRoutes); // ✅ NEW
app.use("/api",             runRoutes);
app.use("/api",             medalReviewRoutes);
app.use("/api", publicReviews);

/* ── ADMIN ── */
app.use("/api/admin/events",         adminEvents);
app.use("/api/admin/submissions",    adminSubmissions);
app.use("/api/admin/registrations",  adminRegistrations);
app.use("/api/admin",                adminStats);
app.use("/api/admin/users",          adminUsers);
app.use("/api/admin/leaderboard",    adminLeaderboard);
app.use("/api/admin",                adminRoutes);
app.use("/api/admin/reviews", adminReviews);
/* ── 404 ── */
app.use((_req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

module.exports = app;
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

/* ── 🆕 USER PROFILE STACK ── */
const authUserRoutes  = require("./routes/auth.user");       // email OTP login
const profileRoutes   = require("./routes/profile.routes");  // dashboard + stats + coach
const couponRoutes    = require("./routes/coupon.routes");   // checkout coupon/referral
const adminTracking   = require("./routes/admin.tracking");  // bulk tracking-ID upload
const chatRoutes      = require("./routes/chat.routes");     // support chatbot

const app = express();

/* Server kab se chal raha hai — purana deploy pakadne mein kaam aata hai */
const STARTED_AT = new Date().toISOString();

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

/* Medal Store ka apna webhook — ye bhi parser se PEHLE, kyunki
   signature raw bytes par banta hai. Live wale webhook se bilkul
   alag file; usme ek line bhi nahi badli. */
app.use("/api", require("./routes/store/medal.webhook"));

/* ── BODY PARSERS ── */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

/* ── HEALTH ── */
app.get("/", (_req, res) => res.send("Valley Run API ✅"));

/* ── /api/version ──
   Server par KAUN SA code chal raha hai, ye bina andaze ke dikhane
   ke liye.

   Zaroorat isliye padi: Medal Store deploy karne par "Route not
   found" aata raha aur hum dono andhere mein the — GitHub par code
   theek tha, par ye pata hi nahi chal raha tha ki Render ne wo
   commit uthaya bhi ya nahi. Ek chhota sa endpoint us andhere ko
   hamesha ke liye khatam kar deta hai.

   RENDER_GIT_COMMIT Render khud deta hai. Koi raaz nahi khulta —
   sirf commit ka hash aur kaun se hisse chalu hain. */
app.get("/api/version", (_req, res) => {
  const on = (v) => String(v).toLowerCase() === "true";
  res.json({
    commit: (process.env.RENDER_GIT_COMMIT || "").slice(0, 7) || "unknown",
    branch: process.env.RENDER_GIT_BRANCH || "unknown",
    startedAt: STARTED_AT,
    features: {
      medalStoreAdmin:  true,                              // hamesha mounted
      medalStorePublic: on(process.env.MEDAL_STORE_ENABLED),
      valleyStore:      on(process.env.STORE_ENABLED),
      attribution:      (process.env.ATTRIBUTION_SECRET || "").length >= 16,
    },
  });
});

/* ── PUBLIC ── */
app.use("/api/payment",     paymentRoutes);
app.use("/api/register",    registrationRoutes);
app.use("/api/events",      eventRoutes);
app.use("/api/leaderboard", leaderboardRoutes); // ✅ NEW
app.use("/api",             runRoutes);
app.use("/api",             medalReviewRoutes);
app.use("/api", publicReviews);

/* ── 🆕 USER (runner) AUTH + PROFILE ── */
app.use("/api/auth",    authUserRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/coupon",  couponRoutes);
app.use("/api/chat",    chatRoutes);
app.use("/api/strava",  require("./routes/strava.routes"));
app.use("/api/stories", require("./routes/stories.public"));

/* Marketing attribution — Next.js ka route handler isse bulata hai.
   Sirf ek signed token wapas karta hai; kuch public expose nahi hota. */
app.use("/api/track",   require("./routes/marketing.public"));

/* ── ADMIN ── */
app.use("/api/admin/events",         adminEvents);
app.use("/api/admin/submissions",    adminSubmissions);
app.use("/api/admin/registrations",  adminRegistrations);
app.use("/api/admin/tracking",       adminTracking);
/* ⚠️ Bare "/api/admin" (adminStats, adminRoutes) se PEHLE — warna
   unka koi /:param route isse pehle match kar sakta hai. */
app.use("/api/admin/marketing",      require("./routes/admin.marketing"));

/* Medal Store admin — ye HAMESHA chalu hai, MEDAL_STORE_ENABLED se
   bandha nahi. Wajah: admin ko switch on karne se PEHLE products
   aur stock bharne hote hain. Andar `protect` laga hai. */
app.use("/api/admin/medal-store",   require("./routes/store/admin.medals"));
app.use("/api/admin",                adminStats);
app.use("/api/admin/users",          adminUsers);
app.use("/api/admin/leaderboard",    adminLeaderboard);
app.use("/api/admin",                adminRoutes);
app.use("/api/admin/reviews", adminReviews);
app.use("/api/admin/stories", require("./routes/admin.stories"));

/* ── MEDAL STORE (public) ──
   Apna alag switch. STORE_ENABLED ko haath nahi lagta: Pahadi store
   band rehte hue bhi medal store khul sakta hai, aur ulta bhi. */
if (String(process.env.MEDAL_STORE_ENABLED).toLowerCase() === "true") {
  app.use("/api/medal-store", require("./routes/store/medal.public"));
  app.use("/api/medal-store", require("./routes/store/medal.checkout"));
  console.log("🏅 Medal Store routes chalu");
} else {
  // Frontend ko saaf jawab mile, 404 ki paheli nahi
  app.use("/api/medal-store", (_req, res) =>
    res.status(503).json({
      success: false,
      code: "MEDAL_STORE_DISABLED",
      message: "The medal store is not open yet.",
    })
  );
}

/* ── VALLEY STORE ──
   Ek switch ke peeche. STORE_ENABLED=false karte hi poora store bandh,
   aur Valley Run (events, registration, medal) jyon ka tyon chalta rehta
   hai — na koi route hatana padta hai, na deploy palatna padta hai.
   Default band hai: galti se aadha-adhura store live na ho jaye. */
if (String(process.env.STORE_ENABLED).toLowerCase() === "true") {
  app.use("/api/store",                 require("./routes/store/public"));
  app.use("/api/admin/store/products",  require("./routes/store/admin.products"));
  app.use("/api/admin/store/categories",require("./routes/store/admin.categories"));
  app.use("/api/admin/store/settings",  require("./routes/store/admin.settings"));
  console.log("🛒 Valley Store routes chalu");
} else {
  // Frontend ko saaf jawab mile, 404 ki paheli nahi
  app.use("/api/store", (_req, res) =>
    res.status(503).json({ success: false, code: "STORE_DISABLED", message: "The store is not open yet." })
  );
}

/* ── 404 ── */
app.use((_req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

module.exports = app;
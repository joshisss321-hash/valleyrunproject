const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const fs      = require("fs");

const Registration  = require("../models/Registration");
const RunSubmission = require("../models/RunSubmission");
const Coupon        = require("../models/Coupon");
const Event         = require("../models/Event");
const imagekit      = require("../config/cloudinary");

const { protectUser } = require("../middleware/userAuth");
const { submissionWindow } = require("../utils/submissionWindow");
const { buildStats }  = require("../utils/coach");
const { getNearestCategory, sortByTiming } = require("../utils/categories");
const { generateCoachTip, statsSignature }  = require("../utils/aiTip");
const {
  ensureReferralCode,
  WELCOME_PERCENT,
  REWARD_PER_REFERRAL,
  REWARD_MAX_PERCENT,
} = require("../utils/referral");

const SITE_URL = process.env.SITE_URL || "https://valleyrun.in";

/* ═══════════════════════════════════════════════════════════
   MEDAL TIMELINE — Amazon/Flipkart style stages
   Purani registrations mein statusHistory nahi hai, isliye
   stages medalStatus se derive karte hain. Dono chalti hain.
═══════════════════════════════════════════════════════════ */
const buildMedalTimeline = (reg, submission) => {
  const status   = reg.medalStatus || "pending";
  const verified = ["verified", "dispatched", "delivered"].includes(status)
    || submission?.status === "approved";
  const dispatched = ["dispatched", "delivered"].includes(status);
  const delivered  = status === "delivered";

  // statusHistory se exact timestamp mil jaye to wahi use karo
  const historyAt = (stage) =>
    reg.statusHistory?.find((h) => h.status === stage)?.at || null;

  return [
    {
      key:   "registered",
      label: "Registration Confirmed",
      note:  "Your entry is confirmed",
      done:  true,
      at:    reg.createdAt,
    },
    {
      key:   "verified",
      label: "Activity Verified",
      note:  verified
        ? "Your activity has been approved"
        : submission
          ? "Verification in progress"
          : "Activity not submitted yet",
      done:  verified,
      at:    historyAt("verified") || (verified ? submission?.updatedAt : null),
    },
    {
      key:   "dispatched",
      label: "Medal Dispatched",
      note:  dispatched
        ? reg.courier
          ? `Shipped via ${reg.courier}`
          : "Handed over to the courier"
        : "Ships once your activity is verified",
      done:  dispatched,
      at:    reg.dispatchedAt || historyAt("dispatched"),
    },
    {
      key:   "delivered",
      label: "Delivered",
      note:  delivered ? "Your medal has arrived 🏅" : "Awaiting delivery",
      done:  delivered,
      at:    reg.deliveredAt || historyAt("delivered"),
    },
  ];
};

/* ═══════════════════════════════════════════════════════════
   GET /api/profile — poora dashboard ek call mein
═══════════════════════════════════════════════════════════ */
router.get("/", protectUser, async (req, res) => {
  try {
    const user = req.user;

    await ensureReferralCode(user);

    /* ── 1. Registrations + submissions ── */
    const [registrations, submissions] = await Promise.all([
      Registration.find({ user: user._id })
        .populate(
          "event",
          "title slug dates medalImage coverImage heroImage image " +
          "registrationDeadline submissionDeadline isRegistrationOpen isPrevious categories"
        )
        .sort({ createdAt: -1 })
        .lean(),
      RunSubmission.find({ email: user.email }).sort({ createdAt: -1 }).lean(),
    ]);

    const submissionBySlug = {};
    submissions.forEach((s) => {
      if (!submissionBySlug[s.eventSlug]) submissionBySlug[s.eventSlug] = s;
    });

    /* ── 2. Ranks — ek hi query mein saare peers ── */
    const approvedSlugs = [
      ...new Set(submissions.filter((s) => s.status === "approved").map((s) => s.eventSlug)),
    ];

    const peers = approvedSlugs.length
      ? await RunSubmission.find({
          eventSlug: { $in: approvedSlugs },
          status:    "approved",
        })
          .select("eventSlug distance timingSeconds email")
          .lean()
      : [];

    const peersBySlug = {};
    peers.forEach((p) => {
      (peersBySlug[p.eventSlug] ||= []).push(p);
    });

    const rankFor = (sub) => {
      if (!sub || sub.status !== "approved") return null;

      const pool     = peersBySlug[sub.eventSlug] || [];
      const category = getNearestCategory(sub.distance);

      const sameCategory = pool
        .filter((p) => getNearestCategory(p.distance) === category)
        .sort(sortByTiming);

      const position = sameCategory.findIndex((p) => p.email === sub.email);
      if (position === -1) return null;

      const overallSorted = [...pool].sort(sortByTiming);
      const overallPos    = overallSorted.findIndex((p) => p.email === sub.email);

      return {
        category,
        rank:            position + 1,
        outOf:           sameCategory.length,
        overallRank:     overallPos === -1 ? null : overallPos + 1,
        overallOutOf:    pool.length,
        percentile: sameCategory.length > 1
          ? Math.round((1 - position / (sameCategory.length - 1)) * 100)
          : 100,
      };
    };

    /* ── 3. Per-event cards ── */
    const events = registrations.map((reg) => {
      const slug = reg.eventSlug || reg.event?.slug || "";
      const sub  = submissionBySlug[slug];

      // Submission window — rule ek hi jagah rehta hai (utils/submissionWindow)
      const window = submissionWindow(reg.event);

      return {
        registrationId: reg._id,

        // Profile se seedha submit karne ke liye
        submission_window: {
          open:       window.open,
          reason:     window.reason || "",
          opensAfter: window.opensAfter || null,
          closesOn:   window.closesOn   || null,
        },
        canSubmit:  window.open && !sub,
        categories: reg.event?.categories?.length ? reg.event.categories : [],
        bibNumber:      reg.bibNumber || "",
        category:       reg.category,
        registeredAt:   reg.createdAt,
        amount:         reg.amount,
        discountAmount: reg.discountAmount || 0,
        couponCode:     reg.couponCode || "",

        event: {
          slug:       slug,
          title:      reg.event?.title || slug,
          dates:      reg.event?.dates || "",
          medalImage: reg.event?.medalImage || "",
          image:      reg.event?.coverImage || reg.event?.heroImage || reg.event?.image || "",
        },

        submission: sub
          ? {
              status:   sub.status,
              distance: sub.distance,
              timing:   sub.timing || "",
              imageUrl: sub.imageUrl,
              note:     sub.adminNote || "",
              at:       sub.createdAt,
            }
          : null,

        rank: rankFor(sub),

        medal: {
          status:      reg.medalStatus || "pending",
          trackingId:  reg.trackingId  || "",
          courier:     reg.courier     || "",
          trackingUrl: reg.trackingUrl || "",
          timeline:    buildMedalTimeline(reg, sub),
        },
      };
    });

    /* ── 4. Stats ── */
    const stats = buildStats({ submissions, registrations });

    /* ── 5. AI coach tip — sirf stats badalne par regenerate ── */
    let coachTip = user.coachTip?.text || null;
    const signature = statsSignature(stats);

    if (user.coachTip?.signature !== signature) {
      const fresh = await generateCoachTip(stats, user.name);
      if (fresh) {
        user.coachTip = { text: fresh, signature, generatedAt: new Date() };
        await user.save();
        coachTip = fresh;
      }
      // fresh null aaya (API key nahi / error) — purani tip hi dikhati rahegi
    }

    /* ── 6. Referral summary ── */
    const coupons = await Coupon.find({
      ownerEmail: user.email,
      active:     true,
    })
      .sort({ createdAt: -1 })
      .lean();

    const count = user.referralCount || 0;

    // Abhi chal raha coupon — har referral pe 2% badhta hai
    const activeReward = coupons.find(
      (c) => c.kind === "referral_reward" && c.usedCount < c.maxUses
    );
    const currentPercent = activeReward?.value || 0;
    const atMax          = currentPercent >= REWARD_MAX_PERCENT;

    res.json({
      success: true,
      user: {
        id:      user._id,
        name:    user.name,
        email:   user.email,
        phone:   user.phone,
        address1: user.address1 || "",
        address2: user.address2 || "",
        landmark: user.landmark || "",
        city:    user.city    || "",
        state:   user.state   || "",
        pincode: user.pincode || "",
        joinedAt: user.createdAt,
      },
      stats,
      coachTip,
      events,
      referral: {
        code: user.referralCode,
        link: `${SITE_URL}?ref=${user.referralCode}`,
        count,

        // Rules — frontend inhi se text banata hai, hardcode kuch nahi
        perReferralPercent: REWARD_PER_REFERRAL,
        maxPercent:         REWARD_MAX_PERCENT,
        welcomePercent:     WELCOME_PERCENT,

        // Abhi ki halat
        currentPercent,
        atMax,
        nextPercent: atMax
          ? REWARD_MAX_PERCENT
          : Math.min(currentPercent + REWARD_PER_REFERRAL, REWARD_MAX_PERCENT),
        coupons: coupons.map((c) => ({
          code:      c.code,
          value:     c.value,
          type:      c.discountType,
          used:      c.usedCount >= c.maxUses,
          expiresAt: c.expiresAt,
          note:      c.note,
        })),
      },
    });
  } catch (err) {
    console.error("profile error:", err);
    res.status(500).json({ success: false, message: "Could not load your profile" });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/profile/track/:registrationId
   Sirf medal tracking — polling ke liye halka endpoint
═══════════════════════════════════════════════════════════ */
router.get("/track/:registrationId", protectUser, async (req, res) => {
  try {
    const reg = await Registration.findOne({
      _id:  req.params.registrationId,
      user: req.user._id, // 🔒 dusre ka order na dikhe
    })
      .populate("event", "title slug")
      .lean();

    if (!reg) {
      return res.status(404).json({ success: false, message: "Registration not found" });
    }

    const sub = await RunSubmission.findOne({
      email:     req.user.email,
      eventSlug: reg.eventSlug || reg.event?.slug,
    }).lean();

    res.json({
      success: true,
      event:   reg.event?.title || reg.eventSlug,
      medal: {
        status:      reg.medalStatus || "pending",
        trackingId:  reg.trackingId  || "",
        courier:     reg.courier     || "",
        trackingUrl: reg.trackingUrl || "",
        timeline:    buildMedalTimeline(reg, sub),
      },
    });
  } catch (err) {
    console.error("track error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/profile/confirm-delivery/:registrationId

   "Medal mil gaya" — runner khud batata hai.

   Courier ka API na hone par delivered status kabhi apne aap nahi
   badalta. Runner ko to pata hi hota hai ki medal aaya ya nahi —
   ek tap mein timeline poori, aur admin ko asli delivery data.
═══════════════════════════════════════════════════════════ */
router.post("/confirm-delivery/:registrationId", protectUser, async (req, res) => {
  try {
    const reg = await Registration.findOne({
      _id:  req.params.registrationId,
      user: req.user._id,          // 🔒 sirf apni registration
    });

    if (!reg) {
      return res.status(404).json({ success: false, message: "Registration not found" });
    }

    if (reg.medalStatus === "delivered") {
      return res.json({ success: true, message: "Already marked as delivered" });
    }

    // Bina dispatch hue "mil gaya" nahi ho sakta
    if (reg.medalStatus !== "dispatched") {
      return res.status(400).json({
        success: false,
        message: "Your medal has not been dispatched yet",
      });
    }

    const now = new Date();
    reg.medalStatus = "delivered";
    reg.deliveredAt = now;
    reg.statusHistory.push({
      status: "delivered",
      note:   "Confirmed by runner",
      at:     now,
    });
    await reg.save();

    console.log(`🏅 Delivery confirmed by runner: ${req.user.email} | ${reg.eventSlug}`);

    res.json({ success: true, message: "Thank you! Enjoy your medal 🏅" });
  } catch (err) {
    console.error("confirm-delivery error:", err);
    res.status(500).json({ success: false, message: "Could not update. Please try again." });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/profile/submit-activity
   Logged-in user apni activity seedhe profile se submit karta hai.

   Phone/email se dhoondhne ki zaroorat nahi — token se pata hai
   kaun hai. Isliye galat number daalne wali dikkat hi khatam.
═══════════════════════════════════════════════════════════ */
const upload  = multer({
  dest: "uploads/",
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB — phone screenshots ke liye kaafi
});

const cleanup = (file) => {
  if (file && fs.existsSync(file.path)) {
    try { fs.unlinkSync(file.path); } catch {}
  }
};

router.post(
  "/submit-activity",
  protectUser,
  upload.single("image"),
  async (req, res) => {
    try {
      const { eventSlug, distance, timing } = req.body;
      const user = req.user;

      if (!eventSlug || !distance) {
        cleanup(req.file);
        return res.status(400).json({ success: false, message: "Event and distance are required" });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: "A screenshot of your activity is required" });
      }

      /* 1. User is event mein register hai? */
      const event = await Event.findOne({ slug: eventSlug });
      if (!event) {
        cleanup(req.file);
        return res.status(404).json({ success: false, message: "Event not found" });
      }

      const registration = await Registration.findOne({ user: user._id, event: event._id });
      if (!registration) {
        cleanup(req.file);
        return res.status(403).json({
          success: false,
          message: "You are not registered for this event",
        });
      }

      /* 2. Submission window khula hai? (wahi rule jo profile dikhata hai) */
      const window = submissionWindow(event);
      if (!window.open) {
        cleanup(req.file);
        return res.status(400).json({ success: false, message: window.reason });
      }

      /* 3. Pehle se submit to nahi kiya? */
      const existing = await RunSubmission.findOne({
        email:     user.email,
        eventSlug,
      });
      if (existing) {
        cleanup(req.file);
        return res.status(400).json({
          success: false,
          message: existing.status === "approved"
            ? "Your activity has already been verified ✅"
            : "You have already submitted for this event. Verification is in progress.",
        });
      }

      /* 4. Screenshot compress karke ImageKit par */
      const sharp = require("sharp");
      const fileBuffer = await sharp(req.file.path)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();

      const uploaded = await imagekit.upload({
        file:     fileBuffer,
        fileName: `${Date.now()}.jpg`,
        folder:   `/valleyrun/submissions/${eventSlug}`,
      });
      cleanup(req.file);

      /* 5. Save — identity token se, form se nahi */
      const submission = await RunSubmission.create({
        name:      user.name,
        email:     user.email,
        phone:     user.phone || "",
        distance,
        timing:    timing || "",
        eventSlug,
        imageUrl:  uploaded.url,
        status:    "pending",
      });

      console.log(`✅ Activity submitted from profile: ${user.email} | ${eventSlug} | ${distance}`);

      res.json({
        success: true,
        message: "Submitted! We will verify it within 24 hours 🎉",
        submission: {
          status:   submission.status,
          distance: submission.distance,
          timing:   submission.timing,
          imageUrl: submission.imageUrl,
          at:       submission.createdAt,
        },
      });
    } catch (err) {
      cleanup(req.file);

      // Duplicate index ne roka (do tabs se ek saath submit)
      if (err.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "You have already submitted for this event",
        });
      }

      console.error("submit-activity error:", err);
      res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
  }
);

module.exports = router;

const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/auth");
const Story = require("../models/Story");
const StorySettings = require("../models/StorySettings");
const { slugify, uniqueSlug } = require("../utils/store/orderNo");

router.use(protect);

/* ═══════════════════════════════════════════════
   GET /  — tabs ke hisaab se list
   ?tab=all|pending|approved|published|featured|homepage|week|rejected|removal
═══════════════════════════════════════════════ */
const tabFilter = (tab) => ({
  all:       {},
  pending:   { status: "pending" },
  approved:  { status: "approved" },
  published: { status: "published" },
  rejected:  { status: "rejected" },
  featured:  { status: "published", badge: { $ne: "" } },
  homepage:  { status: "published", onHomepage: true },
  week:      { status: "published", isStoryOfWeek: true },
  removal:   { removalRequestedAt: { $ne: null } },
}[tab] || {});

router.get("/", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const filter = { ...tabFilter(req.query.tab) };
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ title: rx }, { name: rx }, { email: rx }];
    }

    const [rows, total] = await Promise.all([
      Story.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Story.countDocuments(filter),
    ]);

    res.json({ success: true, stories: rows, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── GET /stats — dashboard ke numbers ── */
router.get("/stats", async (_req, res) => {
  try {
    const [total, pending, approved, published, rejected, homepage, week, removal] = await Promise.all([
      Story.countDocuments({}),
      Story.countDocuments({ status: "pending" }),
      Story.countDocuments({ status: "approved" }),
      Story.countDocuments({ status: "published" }),
      Story.countDocuments({ status: "rejected" }),
      Story.countDocuments({ status: "published", onHomepage: true }),
      Story.countDocuments({ status: "published", isStoryOfWeek: true }),
      Story.countDocuments({ removalRequestedAt: { $ne: null } }),
    ]);
    res.json({ success: true, stats: { total, pending, approved, published, rejected, homepage, week, removal } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── Settings ── */
router.get("/settings", async (_req, res) => {
  try {
    res.json({ success: true, settings: await StorySettings.get() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const SETTING_FIELDS = [
  "sectionEnabled", "heading", "tagline", "whenEmpty", "fallbackText",
  "submissionsOpen", "submitIntro", "consentText", "notifyEmails",
];

router.put("/settings", async (req, res) => {
  try {
    const s = await StorySettings.get();
    for (const k of SETTING_FIELDS) if (req.body[k] !== undefined) s[k] = req.body[k];
    await s.save();
    res.json({ success: true, settings: s });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── GET /:id ── */
router.get("/:id", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PUT /:id — content theek karna (typo, summary, SEO) ── */
const EDITABLE = [
  "title", "summary", "body", "photos", "featuredPhoto",
  "eventSlug", "eventTitle", "seoTitle", "seoDescription",
  "city", "state", "instaId", "adminNote",
];

router.put("/:id", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });

    for (const k of EDITABLE) if (req.body[k] !== undefined) story[k] = req.body[k];

    /* Slug tabhi badlo jab admin khud kahe — publish ke baad badalne par
       jo link log share kar chuke hain wo toot jaate hain. */
    if (req.body.slug && req.body.slug !== story.slug) {
      story.slug = await uniqueSlug(Story, slugify(req.body.slug), story._id);
    }

    await story.save();
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   PATCH /:id/status   — approve / publish / reject

   ⚠️ Consent ke bina publish nahi hoga. Admin se galti ho sakti hai,
      isliye server khud roakta hai — yahi aakhri suraksha hai.
═══════════════════════════════════════════════ */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!Story.STATUS.includes(status)) {
      return res.status(400).json({ success: false, message: "Unknown status" });
    }

    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });

    if (status === "published" && !story.consent?.publishStory) {
      return res.status(400).json({
        success: false,
        code: "NO_CONSENT",
        message: "This story cannot be published — the runner did not give permission.",
      });
    }

    if (status === "published" && story.removalRequestedAt) {
      return res.status(400).json({
        success: false,
        code: "REMOVAL_REQUESTED",
        message: "The runner asked for this story to be taken down. Clear that request first.",
      });
    }

    story.status = status;
    story.reviewedBy = req.admin?.email || "admin";
    story.reviewedAt = new Date();
    if (req.body.adminNote !== undefined) story.adminNote = req.body.adminNote;

    if (status === "published" && !story.publishedAt) story.publishedAt = new Date();

    /* Public se hata to homepage aur week se bhi hatao — warna kahani
       khud to gayab, par homepage par uska khaali khana reh jaata. */
    if (status !== "published") {
      story.onHomepage = false;
      story.isStoryOfWeek = false;
    }

    await story.save();
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PATCH /:id/badge ── */
router.patch("/:id/badge", async (req, res) => {
  try {
    const badge = req.body.badge || "";
    if (!Story.BADGES.includes(badge)) {
      return res.status(400).json({ success: false, message: "Unknown badge" });
    }
    const story = await Story.findByIdAndUpdate(req.params.id, { badge }, { new: true });
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PATCH /:id/homepage ── */
router.patch("/:id/homepage", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });

    const on = req.body.onHomepage !== undefined ? Boolean(req.body.onHomepage) : !story.onHomepage;

    if (on && story.status !== "published") {
      return res.status(400).json({
        success: false,
        message: "Only a published story can go on the homepage.",
      });
    }

    story.onHomepage    = on;
    if (req.body.homepageOrder !== undefined) story.homepageOrder = Number(req.body.homepageOrder) || 0;
    if (req.body.homepageFrom  !== undefined) story.homepageFrom  = req.body.homepageFrom  || null;
    if (req.body.homepageUntil !== undefined) story.homepageUntil = req.body.homepageUntil || null;

    await story.save();
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   PATCH /:id/week  — story of the week
   Ek waqt par ek hi. Nayi chunte hi purani apne aap hat jaati hai,
   warna homepage par do "Story of the Week" dikhne lagti hain.
═══════════════════════════════════════════════ */
router.patch("/:id/week", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });

    const on = req.body.isStoryOfWeek !== undefined ? Boolean(req.body.isStoryOfWeek) : !story.isStoryOfWeek;

    if (on && story.status !== "published") {
      return res.status(400).json({
        success: false,
        message: "Only a published story can be Story of the Week.",
      });
    }

    if (on) {
      await Story.updateMany(
        { _id: { $ne: story._id }, isStoryOfWeek: true },
        { isStoryOfWeek: false }
      );
    }

    story.isStoryOfWeek = on;
    if (req.body.weekFrom  !== undefined) story.weekFrom  = req.body.weekFrom  || null;
    if (req.body.weekUntil !== undefined) story.weekUntil = req.body.weekUntil || null;
    if (on && !story.badge) story.badge = "story_of_week";

    await story.save();
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PATCH /:id/removal — guzarish nipta di ── */
router.patch("/:id/removal", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });

    if (req.body.clear) {
      /* Guzarish hata rahe hain — matlab baat ho gayi aur runner raazi
         hai. Kahani apne aap wapas public nahi hoti; admin ko dobara
         publish karna padega. Jaan-bujh kar. */
      story.removalRequestedAt = null;
      story.removalNote = "";
    } else {
      story.removalRequestedAt = new Date();
      story.removalNote = String(req.body.note || "").slice(0, 500);
      story.onHomepage = false;
      story.isStoryOfWeek = false;
      story.status = "approved";   // public se hata, mita nahi
    }

    await story.save();
    res.json({ success: true, story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── DELETE /:id ──
   Published kahani mitti nahi — uske link log share kar chuke hote
   hain. Sirf rejected kar dete hain. */
router.delete("/:id", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });

    if (story.publishedAt) {
      story.status = "rejected";
      story.onHomepage = false;
      story.isStoryOfWeek = false;
      await story.save();
      return res.json({
        success: true,
        archived: true,
        message: "Ye kahani publish ho chuki thi, isliye hataya nahi — public se nikal di gayi hai.",
      });
    }

    await story.deleteOne();
    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

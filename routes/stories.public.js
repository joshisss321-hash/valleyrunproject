const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const sharp = require("sharp");
const ImageKit = require("imagekit");

const Story = require("../models/Story");
const StorySettings = require("../models/StorySettings");
const { slugify, uniqueSlug } = require("../utils/store/orderNo");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const upload = multer({ dest: "uploads/", limits: { fileSize: 10 * 1024 * 1024 } });

/* Public ko kahani ka saaf roop — email, phone, admin note kabhi bahar nahi */
const publicStory = (s) => ({
  _id:   s._id,
  title: s.title,
  slug:  s.slug,
  summary: s.summary,
  body:  s.body,

  /* Naam tabhi jab usne naam chhapne ki ijazat di ho.
     Nahi di to kahani chhapegi, naam nahi. */
  name: s.consent?.publishName ? s.name : "A Valley Run runner",
  city: s.consent?.publishName ? s.city : "",
  state: s.consent?.publishName ? s.state : "",
  instaId: s.consent?.publishName ? s.instaId : "",

  /* Photo tabhi jab photo ki alag ijazat ho — kahani ki haan ka matlab
     photo ki haan nahi hai. */
  photos:        s.consent?.publishPhotos ? (s.photos || []) : [],
  featuredPhoto: s.consent?.publishPhotos ? s.featuredPhoto : "",

  eventTitle: s.eventTitle || "",
  badge: s.badge || "",
  category: s.category || "",
  publishedAt: s.publishedAt,

  seoTitle:       s.seoTitle || s.title,
  seoDescription: s.seoDescription || s.summary,
});

/* ═══════════════════════════════════════════════
   GET /api/stories           — saari published
   ?page=1&limit=12
═══════════════════════════════════════════════ */
router.get("/", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(36, Math.max(1, parseInt(req.query.limit, 10) || 12));

    const filter = {
      status: "published",
      "consent.publishStory": true,
      removalRequestedAt: null,
    };

    // ?category=running_journey — anjaan value aaye to nazarandaz,
    // warna galat link par page khali dikhta hai
    const cat = String(req.query.category || "");
    if (cat && Story.CATEGORIES.includes(cat) && cat !== "") filter.category = cat;

    const [rows, total] = await Promise.all([
      Story.find(filter).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit),
      Story.countDocuments(filter),
    ]);

    /* Filter ki patti ke liye: kaunsi categories mein sach mein kahani
       hai. Khali category ka chip dikhana bekaar hai. */
    const counts = await Story.aggregate([
      { $match: { status: "published", "consent.publishStory": true, removalRequestedAt: null } },
      { $group: { _id: "$category", n: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      stories: rows.map(publicStory),
      categories: counts
        .filter((c) => c._id)
        .map((c) => ({ key: c._id, count: c.n })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("stories list:", err);
    res.status(500).json({ success: false, message: "Could not load stories" });
  }
});

/* ═══════════════════════════════════════════════
   GET /api/stories/homepage
   Homepage ka section — admin ne jo chuna, usi kram mein.
═══════════════════════════════════════════════ */
router.get("/homepage", async (_req, res) => {
  try {
    const settings = await StorySettings.get();

    if (!settings.sectionEnabled) {
      return res.json({ success: true, enabled: false, stories: [], weekly: null });
    }

    const live = await Story.find({
      status: "published",
      "consent.publishStory": true,
      removalRequestedAt: null,
    }).sort({ homepageOrder: 1, publishedAt: -1 });

    const now = new Date();
    const onHome = live.filter((s) => s.isOnHomepageNow(now));
    const weekly = live.find((s) => s.isWeeklyNow(now)) || null;

    res.json({
      success: true,
      enabled: true,
      heading: settings.heading,
      tagline: settings.tagline,
      whenEmpty: settings.whenEmpty,
      fallbackText: settings.fallbackText,
      weekly: weekly ? publicStory(weekly) : null,
      stories: onHome.map(publicStory),
    });
  } catch (err) {
    console.error("stories homepage:", err);
    res.status(500).json({ success: false, message: "Could not load stories" });
  }
});

/* ═══════════════════════════════════════════════
   GET /api/stories/settings  — submit form ke liye
═══════════════════════════════════════════════ */
router.get("/settings", async (_req, res) => {
  try {
    const s = await StorySettings.get();
    res.json({
      success: true,
      settings: {
        submissionsOpen: s.submissionsOpen,
        submitIntro:     s.submitIntro,
        pageHeroImage:   s.pageHeroImage,
        pageHeroHeading: s.pageHeroHeading,
        pageHeroText:    s.pageHeroText,
        consentText:     s.consentText,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   POST /api/stories  — nayi kahani

   ⚠️ Consent ke bina kuch save nahi hota. Ye marzi ki baat nahi:
      kisi ki kahani bina ijazat ke rakhna hi galat hai.
═══════════════════════════════════════════════ */
router.post("/", upload.array("photos", 5), async (req, res) => {
  const cleanup = () => {
    (req.files || []).forEach((f) => {
      if (f?.path && fs.existsSync(f.path)) { try { fs.unlinkSync(f.path); } catch {} }
    });
  };

  try {
    const settings = await StorySettings.get();
    if (!settings.submissionsOpen) {
      cleanup();
      return res.status(400).json({ success: false, message: "Story submissions are closed right now." });
    }

    const { name, email, phone, city, state, instaId, title, summary, body, eventSlug, eventTitle } = req.body;

    const yes = (v) => v === true || v === "true" || v === "1" || v === "on";
    const consentStory  = yes(req.body.consentStory);
    const consentPhotos = yes(req.body.consentPhotos);
    const consentName   = yes(req.body.consentName);

    if (!name || !email || !title || !body) {
      cleanup();
      return res.status(400).json({ success: false, message: "Name, email, title and your story are all required." });
    }

    if (!consentStory) {
      cleanup();
      return res.status(400).json({
        success: false,
        code: "CONSENT_REQUIRED",
        message: "We can only accept your story if you give us permission to publish it.",
      });
    }

    /* Photo bheji par uski ijazat nahi — photo rakhte hi nahi.
       Upload karke "baad mein poochh lenge" sabse buri aadat hai. */
    const files = consentPhotos ? (req.files || []) : [];
    if (!consentPhotos) cleanup();

    const photos = [];
    for (const f of files) {
      const buf = await sharp(f.path)
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const up = await imagekit.upload({
        file: buf,
        fileName: `story_${Date.now()}_${photos.length}.jpg`,
        folder: "/valleyrun/stories",
      });
      photos.push({ url: up.url, caption: "" });
    }
    cleanup();

    const story = await Story.create({
      name, email, phone, city, state, instaId,
      title,
      slug: await uniqueSlug(Story, slugify(title)),
      summary: summary || "",
      body,
      photos,
      featuredPhoto: photos[0]?.url || "",
      eventSlug: eventSlug || "",
      eventTitle: eventTitle || "",

      consent: {
        publishStory:  consentStory,
        publishPhotos: consentPhotos,
        publishName:   consentName,
        agreedAt:      new Date(),
        // Jo text unhone sach mein dekha, wahi save — baad mein settings
        // badlein to bhi inka record waisa hi rahega
        agreedText:    settings.consentText,
      },

      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Thank you — your story is with our team. We read every one.",
      slug: story.slug,
    });
  } catch (err) {
    cleanup();
    console.error("story submit:", err);
    res.status(500).json({ success: false, message: "Could not save your story. Please try again." });
  }
});

/* ═══════════════════════════════════════════════
   POST /api/stories/:slug/removal
   Participant apni kahani hatane ko keh sakta hai — kabhi bhi.
   Guzarish aate hi kahani public se turant hat jaati hai; admin
   baad mein dekh lega. Pehle hatao, phir baat karo.
═══════════════════════════════════════════════ */
router.post("/:slug/removal", async (req, res) => {
  try {
    const story = await Story.findOne({ slug: req.params.slug });
    if (!story) return res.status(404).json({ success: false, message: "Story not found" });

    const email = String(req.body.email || "").toLowerCase().trim();
    if (!email || email !== story.email) {
      return res.status(403).json({
        success: false,
        message: "Please use the email address you submitted the story with.",
      });
    }

    story.removalRequestedAt = new Date();
    story.removalNote = String(req.body.note || "").slice(0, 500);
    await story.save();

    res.json({
      success: true,
      message: "Your story has been taken down. Our team will confirm by email.",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   GET /api/stories/:slug   — ek kahani
   ⚠️ Sabse neeche, warna /homepage aur /settings isi se match ho jaate.
═══════════════════════════════════════════════ */
router.get("/:slug", async (req, res) => {
  try {
    const story = await Story.findOne({ slug: req.params.slug });

    if (!story || !story.isLive()) {
      return res.status(404).json({ success: false, message: "Story not found" });
    }

    // Ginti badhao par uska intezaar mat karo
    Story.updateOne({ _id: story._id }, { $inc: { views: 1 } }).catch(() => {});

    const related = await Story.find({
      _id: { $ne: story._id },
      status: "published",
      "consent.publishStory": true,
      removalRequestedAt: null,
    }).sort({ publishedAt: -1 }).limit(3);

    res.json({
      success: true,
      story: publicStory(story),
      related: related.map(publicStory),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const sharp = require("sharp");
const ImageKit = require("imagekit");

const Story = require("../models/Story");
const StorySettings = require("../models/StorySettings");
const Event = require("../models/Event");
const { slugify, uniqueSlug } = require("../utils/store/orderNo");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

/* Photo: 3 se zyada nahi, 8 MB se bhari nahi, aur sirf asli image
   formats. Pehle kuch bhi "image/*" chalta tha — HEIC aur TIFF bhi,
   jinhe sharp har server par nahi khol pata, aur tab 500 aata tha
   bina ye bataye ki galti kya hui. */
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 8 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(String(file.mimetype).toLowerCase())) return cb(null, true);
    const err = new Error("Only JPG, PNG and WebP photos can be uploaded.");
    err.code = "BAD_IMAGE_TYPE";
    cb(err);
  },
});

/* Bahut lambi kahani galti se nahi aati — copy-paste ya script se
   aati hai. Itni jagah mein 10,000 shabd aa jaate hain. */
const MAX_BODY    = 60000;
const MAX_TITLE   = 160;
const MAX_SUMMARY = 300;

/* multer ki apni galtiyan (bada file, galat type) warna 500 ban kar
   nikalti hain aur user ko kuch samajh nahi aata. */
const photoUpload = (req, res, next) =>
  upload.array("photos", 3)(req, res, (err) => {
    if (!err) return next();

    const message =
      err.code === "BAD_IMAGE_TYPE"    ? err.message
      : err.code === "LIMIT_FILE_SIZE" ? "Each photo must be 8 MB or smaller."
      : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
                                       ? "You can upload up to 3 photos."
      : "Could not read the photos you uploaded.";

    res.status(400).json({ success: false, message });
  });

/* Public ko kahani ka saaf roop — email, phone, admin note kabhi bahar nahi */
const publicStory = (s) => ({
  _id:   s._id,
  title: s.title,
  slug:  s.slug,
  summary: s.summary,
  body:  s.body,
  pullQuote: s.pullQuote || "",

  /* Naam tabhi jab usne naam chhapne ki ijazat di ho.
     Nahi di to kahani chhapegi, naam nahi. */
  name: s.consent?.publishName ? s.name : "A Valley Run runner",
  city: s.consent?.publishName ? s.city : "",
  state: s.consent?.publishName ? s.state : "",
  /* Instagram ki apni alag haan chahiye — naam dikhane ki ijazat se
     ye nahi chalti. */
  instaId: s.consent?.publishInsta ? s.instaId : "",

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
   GET /api/stories/event-options
   Submit form ke dropdown ke liye.

   ⚠️ Yahan /api/events istemaal NAHI kiya ja sakta: wo sirf
   `active: true` events deta hai. Kahani hamesha guzre hue challenge
   ki hoti hai, aur purane challenge band kar diye jaate hain — Heart
   Day ke saath yahi hua tha. Us list se runner ko apna hi event nahi
   milta. Isliye saare events, naya pehle.
═══════════════════════════════════════════════ */
router.get("/event-options", async (_req, res) => {
  try {
    const rows = await Event.find({}, "title slug").sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      events: rows.filter((e) => e.title).map((e) => ({ title: e.title, slug: e.slug || "" })),
    });
  } catch (err) {
    // Dropdown na bhi mile to form chalna chahiye — khali list bhej do
    console.error("story event options:", err.message);
    res.json({ success: true, events: [] });
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
router.post("/", photoUpload, async (req, res) => {
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

    const { name, email, phone, city, state, title, summary, body, eventSlug, eventTitle } = req.body;

    /* @ ke saath ya bina — dono tarah log likhte hain. Save hamesha
       bina @ ke, warna link banate waqt @@ ban jaata hai. */
    const instaId = String(req.body.instaId || "").trim().replace(/^@+/, "");

    const yes = (v) => v === true || v === "true" || v === "1" || v === "on";
    const consentStory  = yes(req.body.consentStory);
    const consentPhotos = yes(req.body.consentPhotos);
    const consentName   = yes(req.body.consentName);
    const consentInsta  = yes(req.body.consentInsta) && Boolean(instaId);

    if (!name || !email || !title || !body) {
      cleanup();
      return res.status(400).json({ success: false, message: "Name, email, title and your story are all required." });
    }

    /* Hadd se bahar lamba text. Ye galti se nahi hota — isliye saaf
       mana kar dete hain, chup-chaap kaat kar aadhi kahani save karne
       se behtar hai. */
    if (String(body).length > MAX_BODY) {
      cleanup();
      return res.status(400).json({
        success: false,
        message: "Your story is longer than we can accept. Please shorten it a little and try again.",
      });
    }
    if (String(title).length > MAX_TITLE) {
      cleanup();
      return res.status(400).json({ success: false, message: `Please keep the title under ${MAX_TITLE} characters.` });
    }
    if (String(summary || "").length > MAX_SUMMARY) {
      cleanup();
      return res.status(400).json({ success: false, message: `Please keep the one-line description under ${MAX_SUMMARY} characters.` });
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
        publishInsta:  consentInsta,
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

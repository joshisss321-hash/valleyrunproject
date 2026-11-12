const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const { protect } = require("../middleware/auth");
const Influencer     = require("../models/Influencer");
const ReferralClick  = require("../models/ReferralClick");
const Registration   = require("../models/Registration");
const Event          = require("../models/Event");
const User           = require("../models/User");
const Coupon         = require("../models/Coupon");
const A              = require("../utils/attribution");

router.use(protect);

const oid = (v) => {
  try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
};

/* Date range → Mongo filter. Dono taraf optional. */
const dateRange = (from, to) => {
  const r = {};
  if (from) { const d = new Date(from); if (!isNaN(d)) r.$gte = d; }
  if (to)   { const d = new Date(to);   if (!isNaN(d)) { d.setHours(23, 59, 59, 999); r.$lte = d; } }
  return Object.keys(r).length ? r : null;
};

/* Registration par lagne wale saare filter ek jagah */
const regFilter = (q) => {
  const f = {};
  if (q.eventSlug) f.eventSlug = String(q.eventSlug);
  if (q.source)    f["attribution.source"] = String(q.source);
  if (q.influencer) {
    const id = oid(q.influencer);
    if (id) f["attribution.influencer"] = id;
  }
  const range = dateRange(q.from, q.to);
  if (range) f.createdAt = range;
  return f;
};

/* ═══════════════════════════════════════════════
   GET /health — kya feature sach mein chalu hai
   Admin ko silently toota feature se bura kuch nahi.
═══════════════════════════════════════════════ */
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    enabled: A.isEnabled(),
    message: A.isEnabled()
      ? "Attribution tracking is live."
      : "ATTRIBUTION_SECRET is not set on the server, so nothing is being tracked. " +
        "Add it in Render (any long random string) and redeploy.",
  });
});

/* ═══════════════════════════════════════════════
   INFLUENCERS — CRUD
═══════════════════════════════════════════════ */

/* Code sirf influencers mein hi nahi, poore system mein unique hona
   chahiye. Agar kisi runner ka referral code ya koi coupon usi naam
   ka hua, to log confuse honge aur support ka kaam badhega. */
const codeTaken = async (code, ignoreId) => {
  const mine = await Influencer.findOne({ code }).select("_id").lean();
  if (mine && String(mine._id) !== String(ignoreId || "")) return "Another influencer already has this code";

  if (await User.exists({ referralCode: code })) return "A runner's referral code already uses this — pick another";
  if (await Coupon.exists({ code })) return "A coupon already uses this code — pick another";
  return "";
};

/* GET /influencers?event=&status=&search=&page=&limit= */
router.get("/influencers", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const filter = {};
    if (req.query.status === "active")   filter.isActive = true;
    if (req.query.status === "inactive") filter.isActive = false;
    if (req.query.event) {
      const id = oid(req.query.event);
      if (id) filter.eventIds = id;
    }
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { code: rx }, { instagramUsername: rx }, { email: rx }];
    }

    const [rows, total] = await Promise.all([
      Influencer.find(filter).sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit)
        .populate("eventIds", "title slug").lean(),
      Influencer.countDocuments(filter),
    ]);

    res.json({ success: true, influencers: rows, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* GET /influencers/suggest-code?name=Rahul%20Sharma&event=<id> */
router.get("/influencers/suggest-code", async (req, res) => {
  try {
    const namePart = String(req.query.name || "")
      .toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "VR";

    let eventPart = "";
    if (req.query.event) {
      const ev = await Event.findById(oid(req.query.event)).select("slug").lean();
      if (ev) eventPart = String(ev.slug || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
    }

    for (let i = 0; i < 25; i++) {
      const tail = i === 0 ? "" : String(i + 1);
      const code = Influencer.cleanCode(namePart + eventPart + tail);
      if (code && !(await codeTaken(code))) return res.json({ success: true, code });
    }
    res.json({ success: true, code: Influencer.cleanCode(namePart + Date.now().toString(36)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const EDITABLE = ["name", "instagramUsername", "email", "phone", "notes"];

const cleanInsta = (v) => String(v || "").trim().replace(/^@+/, "").replace(/\s+/g, "");

router.post("/influencers", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Influencer name is required" });

    const code = Influencer.cleanCode(req.body.code);
    if (!code || code.length < 3) {
      return res.status(400).json({ success: false, message: "Referral code must be at least 3 letters or numbers" });
    }

    const clash = await codeTaken(code);
    if (clash) return res.status(400).json({ success: false, code: "CODE_TAKEN", message: clash });

    const eventIds = (Array.isArray(req.body.eventIds) ? req.body.eventIds : [])
      .map(oid).filter(Boolean);

    const influencer = await Influencer.create({
      name,
      instagramUsername: cleanInsta(req.body.instagramUsername),
      email: String(req.body.email || "").trim(),
      phone: String(req.body.phone || "").trim(),
      code,
      eventIds,
      isActive: req.body.isActive !== false,
      notes: String(req.body.notes || ""),
    });

    res.status(201).json({ success: true, influencer });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, code: "CODE_TAKEN", message: "That code is already taken" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/influencers/:id", async (req, res) => {
  try {
    const inf = await Influencer.findById(req.params.id);
    if (!inf) return res.status(404).json({ success: false, message: "Influencer not found" });

    for (const k of EDITABLE) if (req.body[k] !== undefined) inf[k] = req.body[k];
    if (req.body.instagramUsername !== undefined) inf.instagramUsername = cleanInsta(req.body.instagramUsername);

    if (req.body.eventIds !== undefined) {
      inf.eventIds = (Array.isArray(req.body.eventIds) ? req.body.eventIds : []).map(oid).filter(Boolean);
    }

    /* Code badalna khatarnaak hai — jo link pehle se Instagram ki bio
       mein aur WhatsApp par ghoom rahe hain, wo turant mar jaate hain.
       Isliye admin ko saaf bata kar hi badalte hain. */
    if (req.body.code !== undefined) {
      const code = Influencer.cleanCode(req.body.code);
      if (code !== inf.code) {
        if (!code || code.length < 3) {
          return res.status(400).json({ success: false, message: "Referral code must be at least 3 letters or numbers" });
        }
        const clash = await codeTaken(code, inf._id);
        if (clash) return res.status(400).json({ success: false, code: "CODE_TAKEN", message: clash });
        inf.code = code;
      }
    }

    await inf.save();
    res.json({ success: true, influencer: inf });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/influencers/:id/status", async (req, res) => {
  try {
    const inf = await Influencer.findById(req.params.id);
    if (!inf) return res.status(404).json({ success: false, message: "Influencer not found" });

    inf.isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : !inf.isActive;
    await inf.save();

    res.json({
      success: true,
      influencer: inf,
      message: inf.isActive
        ? "Active again — their link will start earning credit from now."
        : "Deactivated. Their past numbers stay exactly as they are; only new visits stop counting.",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* DELETE — sirf tab jab kisi registration se juda na ho.
   Juda ho to mitana matlab purana hisaab khona. Deactivate hi theek. */
router.delete("/influencers/:id", async (req, res) => {
  try {
    const inf = await Influencer.findById(req.params.id);
    if (!inf) return res.status(404).json({ success: false, message: "Influencer not found" });

    const regs = await Registration.countDocuments({ "attribution.influencer": inf._id });
    if (regs > 0) {
      return res.status(400).json({
        success: false,
        code: "HAS_REGISTRATIONS",
        message:
          `${regs} registration${regs > 1 ? "s are" : " is"} credited to this influencer. ` +
          "Deleting would lose that history — deactivate them instead.",
      });
    }

    await ReferralClick.deleteMany({ influencer: inf._id });
    await inf.deleteOne();
    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   ANALYTICS
═══════════════════════════════════════════════ */

/** Har influencer ke clicks aur unique visitors — ek hi query mein. */
const clickStats = async (influencerIds, range) => {
  const match = { influencer: { $in: influencerIds } };
  if (range) match.createdAt = range;

  const rows = await ReferralClick.aggregate([
    { $match: match },
    { $group: { _id: "$influencer", clicks: { $sum: 1 }, visitors: { $addToSet: "$visitorHash" } } },
    { $project: { clicks: 1, unique: { $size: "$visitors" } } },
  ]);

  const map = {};
  rows.forEach((r) => { map[String(r._id)] = { clicks: r.clicks, unique: r.unique }; });
  return map;
};

/* GET /overview?eventSlug=&from=&to= */
router.get("/overview", async (req, res) => {
  try {
    const filter = regFilter(req.query);
    const range  = dateRange(req.query.from, req.query.to);

    /* Source-wise ginti.
       ⚠️ Jinki attribution khali hai unhe "Direct" NAHI ginn rahe.
       Wo "not_tracked" hain — ho sakta hai cookie band thi, ya ye
       registration is feature se pehle ki ho. Unhe Direct keh dena
       ek jhootha number banata. */
    const bySource = await Registration.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $ifNull: ["$attribution.source", ""] },
          registrations: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$attribution.paidAmount", 0] } },
        },
      },
    ]);

    const sources = {};
    let totalRegs = 0, trackedRegs = 0, attributedRevenue = 0;

    bySource.forEach((r) => {
      const key = r._id || "not_tracked";
      sources[key] = { registrations: r.registrations, revenue: r.revenue };
      totalRegs += r.registrations;
      if (key !== "not_tracked") {
        trackedRegs += r.registrations;
        attributedRevenue += r.revenue;
      }
    });

    /* Roz ka hisaab — chart ke liye */
    const daily = await Registration.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
            source: { $ifNull: ["$attribution.source", ""] },
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]);

    /* Clicks banaam registrations */
    const clickMatch = range ? { createdAt: range } : {};
    const [totalClicks, uniqueAgg, activeInfluencers] = await Promise.all([
      ReferralClick.countDocuments(clickMatch),
      ReferralClick.aggregate([
        { $match: clickMatch },
        { $group: { _id: "$visitorHash" } },
        { $count: "n" },
      ]),
      Influencer.countDocuments({ isActive: true }),
    ]);

    res.json({
      success: true,
      enabled: A.isEnabled(),
      totals: {
        registrations: totalRegs,
        tracked: trackedRegs,
        notTracked: totalRegs - trackedRegs,
        attributedRevenue,
        clicks: totalClicks,
        uniqueVisitors: uniqueAgg[0] ? uniqueAgg[0].n : 0,
        activeInfluencers,
      },
      sources,
      sourceLabels: A.SOURCE_LABEL,
      daily: daily.map((d) => ({ day: d._id.day, source: d._id.source || "not_tracked", n: d.n })),
    });
  } catch (err) {
    console.error("marketing overview:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* GET /performance?eventSlug=&from=&to=&sort=&status= */
router.get("/performance", async (req, res) => {
  try {
    const infFilter = {};
    if (req.query.status === "active")   infFilter.isActive = true;
    if (req.query.status === "inactive") infFilter.isActive = false;
    if (req.query.event) {
      const id = oid(req.query.event);
      if (id) infFilter.eventIds = id;
    }

    const influencers = await Influencer.find(infFilter)
      .populate("eventIds", "title slug").lean();

    if (!influencers.length) return res.json({ success: true, rows: [] });

    const ids = influencers.map((i) => i._id);
    const range = dateRange(req.query.from, req.query.to);

    const regMatch = { "attribution.influencer": { $in: ids } };
    if (range) regMatch.createdAt = range;
    if (req.query.eventSlug) regMatch.eventSlug = String(req.query.eventSlug);

    const [clicks, regAgg] = await Promise.all([
      clickStats(ids, range),
      Registration.aggregate([
        { $match: regMatch },
        {
          $group: {
            _id: "$attribution.influencer",
            registrations: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$attribution.paidAmount", 0] } },
          },
        },
      ]),
    ]);

    const regMap = {};
    regAgg.forEach((r) => { regMap[String(r._id)] = r; });

    const rows = influencers.map((inf) => {
      const c = clicks[String(inf._id)] || { clicks: 0, unique: 0 };
      const r = regMap[String(inf._id)] || { registrations: 0, revenue: 0 };
      return {
        _id: inf._id,
        name: inf.name,
        instagramUsername: inf.instagramUsername,
        code: inf.code,
        isActive: inf.isActive,
        events: (inf.eventIds || []).map((e) => ({ title: e.title, slug: e.slug })),
        clicks: c.clicks,
        unique: c.unique,
        registrations: r.registrations,
        revenue: r.revenue,
        /* Conversion unique visitors par — clicks par nahi. Ek hi
           banda paanch baar refresh kare to clicks paanch, log ek. */
        conversion: c.unique > 0 ? Math.round((r.registrations / c.unique) * 1000) / 10 : null,
      };
    });

    const sort = String(req.query.sort || "registrations");
    const by = {
      registrations: (a, b) => b.registrations - a.registrations,
      revenue:       (a, b) => b.revenue - a.revenue,
      clicks:        (a, b) => b.clicks - a.clicks,
      conversion:    (a, b) => (b.conversion ?? -1) - (a.conversion ?? -1),
      name:          (a, b) => a.name.localeCompare(b.name),
    }[sort] || ((a, b) => b.registrations - a.registrations);

    rows.sort(by);
    res.json({ success: true, rows });
  } catch (err) {
    console.error("marketing performance:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* GET /influencers/:id/detail — ek influencer ka poora hisaab */
router.get("/influencers/:id/detail", async (req, res) => {
  try {
    const inf = await Influencer.findById(req.params.id).populate("eventIds", "title slug").lean();
    if (!inf) return res.status(404).json({ success: false, message: "Influencer not found" });

    const range = dateRange(req.query.from, req.query.to);
    const regMatch = { "attribution.influencer": inf._id };
    if (range) regMatch.createdAt = range;

    const [clicks, regs, byEvent, dailyClicks, dailyRegs] = await Promise.all([
      clickStats([inf._id], range),
      Registration.find(regMatch)
        .sort({ createdAt: -1 }).limit(200)
        .populate("user", "name city state")
        .select("eventSlug category createdAt bibNumber attribution")
        .lean(),
      Registration.aggregate([
        { $match: regMatch },
        {
          $group: {
            _id: "$eventSlug",
            registrations: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$attribution.paidAmount", 0] } },
          },
        },
        { $sort: { registrations: -1 } },
      ]),
      ReferralClick.aggregate([
        { $match: range ? { influencer: inf._id, createdAt: range } : { influencer: inf._id } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Registration.aggregate([
        { $match: regMatch },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const c = clicks[String(inf._id)] || { clicks: 0, unique: 0 };
    const revenue = regs.reduce((s, r) => s + (r.attribution?.paidAmount || 0), 0);

    res.json({
      success: true,
      influencer: inf,
      stats: {
        clicks: c.clicks,
        unique: c.unique,
        registrations: regs.length,
        revenue,
        conversion: c.unique > 0 ? Math.round((regs.length / c.unique) * 1000) / 10 : null,
      },
      byEvent,
      registrations: regs,
      dailyClicks: dailyClicks.map((d) => ({ day: d._id, n: d.n })),
      dailyRegs:   dailyRegs.map((d) => ({ day: d._id, n: d.n })),
    });
  } catch (err) {
    console.error("influencer detail:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   GET /export — CSV/Excel ke liye flattened rows

   Maujooda export ka hi tareeka: server saaf rows deta hai, file
   browser mein banti hai (admin/registrations wala pattern).

   ⚠️ Yahan participant ka email/phone/pata jaan-bujh kar NAHI
   bheja jaata. Ye marketing ka report hai; iske liye kisi ka pata
   chahiye hi nahi. Participant ki poori detail wahi purani
   registrations export deti hai.
═══════════════════════════════════════════════ */
router.get("/export", async (req, res) => {
  try {
    const filter = regFilter(req.query);

    const rows = await Registration.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "name city state")
      .populate("attribution.influencer", "name code instagramUsername")
      .select("eventSlug category amount bibNumber createdAt attribution")
      .lean();

    const events = await Event.find({}).select("slug title").lean();
    const titleOf = {};
    events.forEach((e) => { titleOf[e.slug] = e.title || e.slug; });

    res.json({
      success: true,
      rows: rows.map((r, i) => {
        const a = r.attribution || {};
        return {
          sr: i + 1,
          registrationId: String(r._id),
          bib: r.bibNumber || "",
          event: titleOf[r.eventSlug] || r.eventSlug || "",
          eventSlug: r.eventSlug || "",
          category: r.category || "",
          date: r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
          participant: r.user?.name || "",
          city: r.user?.city || "",
          marketingSource: a.source ? (A.SOURCE_LABEL[a.source] || a.source) : "Not tracked",
          influencer: a.influencer?.name || "",
          referralCode: a.code || "",
          utmCampaign: a.campaign || "",
          utmMedium: a.medium || "",
          firstTouch: a.firstTouchSource ? (A.SOURCE_LABEL[a.firstTouchSource] || a.firstTouchSource) : "",
          lastTouch: a.lastTouchSource ? (A.SOURCE_LABEL[a.lastTouchSource] || a.lastTouchSource) : "",
          /* Registration par likha amount raw event.price se banta hai
             aur early-bird ke baad kam dikhata hai. Jo sach mein kata
             wo attribution.paidAmount hai. Dono de rahe hain taaki
             farq chhupe nahi. */
          amountCharged: a.paidAmount || "",
          amountOnRecord: r.amount || 0,
        };
      }),
    });
  } catch (err) {
    console.error("marketing export:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

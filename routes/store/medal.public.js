const express = require("express");
const router = express.Router();

const StoreProduct  = require("../../models/store/StoreProduct");
const MedalSettings = require("../../models/store/MedalSettings");
const { available } = require("../../utils/store/medalStock");

/* ═══════════════════════════════════════════════════════════════
   MEDAL STORE — public (bina login ke)

   ⚠️ Yahan sirf `kind: "medal"` dikhta hai. Pahadi store ke
   products yahan kabhi nahi aayenge, aur na hi iske medals wahan.
   ═══════════════════════════════════════════════════════════════ */

/* Public ko medal ka saaf roop.

   ⚠️ Asli `stock` number kabhi bahar nahi jaata — sirf kitna
   khareeda ja sakta hai. Warna log jaan jaate ki kitna maal pada
   hai, aur `reserved` ki andar ki ginti bhi dikh jaati. */
const publicMedal = (p) => {
  const left = available(p);
  return {
    _id:  p._id,
    name: p.name,
    slug: p.slug,
    shortDesc: p.shortDesc || "",
    longDesc:  p.longDesc  || "",
    eventName: p.sourceRegion || "",   // medal ke liye yahi "kis event ka" hai

    images:        (p.images || []).map((i) => ({ url: i.url, alt: i.alt || "" })),
    featuredImage: p.featuredImage || p.images?.[0]?.url || "",

    price: p.price,
    mrp:   p.mrp && p.mrp > p.price ? p.mrp : null,
    discountPercent:
      p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0,

    /* Kitne khareede ja sakte hain. Zyada ho to exact number chhupa
       dete hain — "12 bache hain" se "In stock" behtar lagta hai,
       aur kam ho to "Only 3 left" sach mein kaam karta hai. */
    inStock: left > 0,
    left:    left > 0 && left <= 10 ? left : null,
    maxQty:  Math.min(left, 10),

    shippingNote: p.shippingNote || "",
    returnNote:   p.returnNote   || "",
  };
};

/* Out of stock medal public se GAYAB — admin mein dikhta rahega.
   Mongo mein `stock - reserved > 0` filter karna padta hai, isliye
   $expr. */
const LIVE = {
  kind: "medal",
  isPublished: true,
  $expr: { $gt: [{ $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }, 0] },
};

/* ── GET /api/medal-store/products ── */
router.get("/products", async (_req, res) => {
  try {
    const rows = await StoreProduct.find(LIVE)
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    res.json({ success: true, medals: rows.map(publicMedal), total: rows.length });
  } catch (err) {
    console.error("medal list:", err.message);
    res.status(500).json({ success: false, message: "Could not load the medals" });
  }
});

/* ── GET /api/medal-store/products/:slug ── */
router.get("/products/:slug", async (req, res) => {
  try {
    const p = await StoreProduct.findOne({ slug: req.params.slug, kind: "medal", isPublished: true }).lean();

    if (!p) {
      return res.status(404).json({ success: false, message: "This medal is no longer listed." });
    }

    /* Bik chuka hai to 410 — 404 se alag, kyunki page tha to sahi.
       Frontend "sold out" dikha sakta hai, "page not found" nahi. */
    if (available(p) <= 0) {
      return res.status(410).json({
        success: false,
        code: "SOLD_OUT",
        message: "This medal is sold out.",
        medal: { name: p.name, slug: p.slug, featuredImage: p.featuredImage || "" },
      });
    }

    const others = await StoreProduct.find({ ...LIVE, _id: { $ne: p._id } })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(4)
      .lean();

    res.json({
      success: true,
      medal: publicMedal(p),
      others: others.map(publicMedal),
    });
  } catch (err) {
    console.error("medal detail:", err.message);
    res.status(500).json({ success: false, message: "Could not load this medal" });
  }
});

/* ── GET /api/medal-store/settings ── */
router.get("/settings", async (_req, res) => {
  try {
    const s = await MedalSettings.get();
    res.json({
      success: true,
      settings: {
        storeName: s.storeName,
        tagline:   s.tagline,
        heroHeading: s.heroHeading,
        heroText:    s.heroText,
        heroImage:   s.heroImage,
        shippingFlat: s.shippingFlat,
        freeOver:     s.freeOver,
        supportEmail: s.supportEmail,
        supportPhone: s.supportPhone,
        dispatchNote: s.dispatchNote,
        shippingPolicy: s.shippingPolicy,
        returnPolicy:   s.returnPolicy,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.publicMedal = publicMedal;
module.exports.LIVE = LIVE;

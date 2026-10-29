const express = require("express");
const router = express.Router();

const StoreProduct = require("../../models/store/StoreProduct");
const StoreCategory = require("../../models/store/StoreCategory");
const StoreBanner = require("../../models/store/StoreBanner");
const StoreSettings = require("../../models/store/StoreSettings");
const { publicProduct } = require("../../utils/store/pricing");

/* Sab kuch sirf PADHNE ke liye. Yahan se kabhi kuch likhta nahi.
   Har jagah isPublished: true — admin ne jo live nahi kiya, wo bahar
   nikalta hi nahi. */

const num = (v, def) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? def : n;
};

/* ═══════════════════════════════════════════════════
   GET /api/store/products
   ?category=slug &q=ghee &min=100 &max=900 &sort=new
   &inStock=1 &page=1 &limit=24
═══════════════════════════════════════════════════ */
router.get("/products", async (req, res) => {
  try {
    const { category, q, min, max, sort, inStock } = req.query;
    const page = Math.max(1, num(req.query.page, 1));
    const limit = Math.min(60, Math.max(1, num(req.query.limit, 24)));

    const filter = { isPublished: true };

    if (category) {
      const cat = await StoreCategory.findOne({ slug: category, isPublished: true })
        .select("_id").lean();
      // Category hai hi nahi / live nahi — khali list, poori list nahi
      if (!cat) {
        return res.json({ success: true, products: [], total: 0, page: 1, totalPages: 0 });
      }
      filter.categories = cat._id;
    }

    if (q && String(q).trim()) {
      const safe = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ name: rx }, { shortDesc: rx }, { sourceRegion: rx }];
    }

    let products = await StoreProduct.find(filter)
      .populate("categories", "name slug")
      .lean();

    let shaped = products.map(publicProduct);

    // Daam aur stock variants mein chhupe hote hain, isliye chhantai JS mein
    const minP = min !== undefined ? Number(min) : null;
    const maxP = max !== undefined ? Number(max) : null;
    if (minP !== null && !isNaN(minP)) shaped = shaped.filter((p) => p.priceTo >= minP);
    if (maxP !== null && !isNaN(maxP)) shaped = shaped.filter((p) => p.priceFrom <= maxP);
    if (inStock === "1") shaped = shaped.filter((p) => p.inStock);

    const raw = new Map(products.map((p) => [String(p._id), p]));
    const orig = (p) => raw.get(String(p._id)) || {};

    switch (sort) {
      case "price_asc":  shaped.sort((a, b) => a.priceFrom - b.priceFrom); break;
      case "price_desc": shaped.sort((a, b) => b.priceFrom - a.priceFrom); break;
      case "new":        shaped.sort((a, b) => new Date(orig(b).createdAt) - new Date(orig(a).createdAt)); break;
      case "popular":    shaped.sort((a, b) => (orig(b).soldCount || 0) - (orig(a).soldCount || 0)); break;
      default:
        shaped.sort((a, b) =>
          (orig(a).sortOrder || 0) - (orig(b).sortOrder || 0) ||
          new Date(orig(b).createdAt) - new Date(orig(a).createdAt));
    }

    // Stock khatam wale hamesha neeche
    shaped.sort((a, b) => Number(b.inStock) - Number(a.inStock));

    const total = shaped.length;
    const start = (page - 1) * limit;

    res.json({
      success: true,
      products: shaped.slice(start, start + limit),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("store/products:", err);
    res.status(500).json({ success: false, message: "Could not load products" });
  }
});

/* ═══════════════════════════════════════════════════
   GET /api/store/products/:slug
═══════════════════════════════════════════════════ */
router.get("/products/:slug", async (req, res) => {
  try {
    const p = await StoreProduct.findOne({ slug: req.params.slug, isPublished: true })
      .populate("categories", "name slug")
      .lean();

    if (!p) return res.status(404).json({ success: false, message: "Product not found" });

    // Isi category ke doosre products — apne aap ko chhodkar
    const catIds = (p.categories || []).map((c) => c._id);
    const related = catIds.length
      ? await StoreProduct.find({
          _id: { $ne: p._id },
          isPublished: true,
          categories: { $in: catIds },
        }).limit(8).lean()
      : [];

    res.json({
      success: true,
      product: publicProduct(p),
      related: related.map(publicProduct),
    });
  } catch (err) {
    console.error("store/product:", err);
    res.status(500).json({ success: false, message: "Could not load product" });
  }
});

/* ═══════════════════════════════════════════════════
   GET /api/store/categories
═══════════════════════════════════════════════════ */
router.get("/categories", async (_req, res) => {
  try {
    const cats = await StoreCategory.find({ isPublished: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    // Har category mein kitne live products — khali category dikhane ka fayda nahi
    const counts = await StoreProduct.aggregate([
      { $match: { isPublished: true } },
      { $unwind: "$categories" },
      { $group: { _id: "$categories", n: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));

    res.json({
      success: true,
      categories: cats.map((c) => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        image: c.image,
        imageAlt: c.imageAlt,
        isFeatured: c.isFeatured,
        productCount: byId.get(String(c._id)) || 0,
      })),
    });
  } catch (err) {
    console.error("store/categories:", err);
    res.status(500).json({ success: false, message: "Could not load categories" });
  }
});

/* ═══════════════════════════════════════════════════
   GET /api/store/banners
   Sirf wahi jo ABHI chal rahe hain — khatam hue apne aap gayab.
═══════════════════════════════════════════════════ */
router.get("/banners", async (_req, res) => {
  try {
    const all = await StoreBanner.find({ active: true }).sort({ sortOrder: 1 });
    const now = new Date();

    res.json({
      success: true,
      banners: all.filter((b) => b.isLive(now)).map((b) => ({
        _id: b._id,
        title: b.title,
        subtitle: b.subtitle,
        image: b.image,
        imageAlt: b.imageAlt,
        link: b.link,
        ctaText: b.ctaText,
        couponCode: b.couponCode,
        placement: b.placement,
        // endsAt hai to hi countdown — nakli timer kabhi nahi
        endsAt: b.endsAt || null,
      })),
    });
  } catch (err) {
    console.error("store/banners:", err);
    res.status(500).json({ success: false, message: "Could not load banners" });
  }
});

/* ═══════════════════════════════════════════════════
   GET /api/store/settings
   Sirf wo hissa jo public dekh sakta hai.
═══════════════════════════════════════════════════ */
router.get("/settings", async (_req, res) => {
  try {
    const s = await StoreSettings.get();

    res.json({
      success: true,
      settings: {
        storeName: s.storeName,
        tagline: s.tagline,
        supportEmail: s.supportEmail,
        supportPhone: s.supportPhone,
        currency: s.currency,

        shippingMode: s.shippingMode,
        shippingFlat: s.shippingFlat,
        shippingPerKg: s.shippingPerKg,
        freeShippingOver: s.freeShippingOver,
        codEnabled: s.codEnabled,
        codCharge: s.codCharge,

        // Khali hai to bhejte hi nahi — frontend khali heading na dikhaye
        fssaiNumber: s.fssaiNumber || "",
        gstNumber: s.gstNumber || "",
        legalEntityName: s.legalEntityName || "",

        heroHeading: s.heroHeading,
        heroSubtext: s.heroSubtext,
        heroImage: s.heroImage,
        heroCtaText: s.heroCtaText,
        heroCtaLink: s.heroCtaLink,
        storyHeading: s.storyHeading,
        storyBody: s.storyBody,
        storyImage: s.storyImage,
        faqs: s.faqs || [],

        shippingPolicy: s.shippingPolicy,
        returnPolicy: s.returnPolicy,
        cancellationPolicy: s.cancellationPolicy,
        privacyPolicy: s.privacyPolicy,
        terms: s.terms,
        aboutStore: s.aboutStore,
      },
    });
  } catch (err) {
    console.error("store/settings:", err);
    res.status(500).json({ success: false, message: "Could not load store settings" });
  }
});

module.exports = router;

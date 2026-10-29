const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const ImageKit = require("imagekit");
const sharp = require("sharp");

const { protect } = require("../../middleware/auth");
const StoreProduct = require("../../models/store/StoreProduct");
const StoreStockLog = require("../../models/store/StoreStockLog");
const { slugify, uniqueSlug } = require("../../utils/store/orderNo");
const { totalStock } = require("../../utils/store/pricing");

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB se badi photo nahi
});

/* Saara router login ke peeche. Ek-ek route par protect lagane se
   kabhi na kabhi ek chhoot jata hai — isliye poore router par. */
router.use(protect);

const cleanup = (file) => {
  if (file?.path && fs.existsSync(file.path)) {
    try { fs.unlinkSync(file.path); } catch {}
  }
};

/* Client jo bheje wo seedha schema mein nahi daalte — sirf ye fields. */
const WRITABLE = [
  "name", "shortDesc", "longDesc", "categories",
  "price", "mrp", "sku", "stock", "unit", "weightGm", "variants", "lowStockAt",
  "images", "featuredImage",
  "ingredients", "sourceRegion", "storage", "shelfLife",
  "fssaiNumber", "gstHsnCode", "sellerName", "sellerAddress",
  "packerName", "packerAddress", "countryOrigin",
  "isPublished", "isFeatured", "isBestSeller", "isNewArrival", "sortOrder",
  "shippingNote", "returnNote", "isReturnable",
  "seoTitle", "seoDescription",
];

const pickWritable = (body) => {
  const out = {};
  for (const k of WRITABLE) if (body[k] !== undefined) out[k] = body[k];
  return out;
};

/* Daam aur stock kabhi minus mein na jaayein — galti se bhi nahi */
const sanitise = (data) => {
  const nonNeg = (v) => Math.max(0, Number(v) || 0);

  if (data.price !== undefined) data.price = nonNeg(data.price);
  if (data.stock !== undefined) data.stock = nonNeg(data.stock);
  if (data.weightGm !== undefined) data.weightGm = nonNeg(data.weightGm);
  if (data.mrp !== undefined) data.mrp = data.mrp ? nonNeg(data.mrp) : null;

  if (Array.isArray(data.variants)) {
    data.variants = data.variants.map((v) => ({
      ...v,
      price: nonNeg(v.price),
      stock: nonNeg(v.stock),
      weightGm: nonNeg(v.weightGm),
      mrp: v.mrp ? nonNeg(v.mrp) : null,
    }));
  }
  return data;
};

/* ── GET /  — list, filter, paginate ── */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const filter = {};
    if (req.query.category) filter.categories = req.query.category;
    if (req.query.published === "1") filter.isPublished = true;
    if (req.query.published === "0") filter.isPublished = false;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(safe, "i");
    }

    const [rows, total] = await Promise.all([
      StoreProduct.find(filter)
        .populate("categories", "name slug")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StoreProduct.countDocuments(filter),
    ]);

    res.json({
      success: true,
      products: rows.map((p) => ({ ...p, totalStock: totalStock(p) })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── GET /:id ── */
router.get("/:id", async (req, res) => {
  try {
    const p = await StoreProduct.findById(req.params.id).populate("categories", "name slug");
    if (!p) return res.status(404).json({ success: false, message: "Product not found" });
    res.json({ success: true, product: p });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── POST /  — naya product ── */
router.post("/", async (req, res) => {
  try {
    const data = sanitise(pickWritable(req.body));

    if (!data.name || !String(data.name).trim()) {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }

    data.slug = await uniqueSlug(StoreProduct, req.body.slug || data.name);

    const product = await StoreProduct.create(data);

    if (totalStock(product) > 0) {
      await StoreStockLog.create({
        product: product._id, delta: totalStock(product),
        before: 0, after: totalStock(product),
        reason: "restock", by: req.admin?.email || "admin",
        note: "Pehla stock",
      });
    }

    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PUT /:id ── */
router.put("/:id", async (req, res) => {
  try {
    const existing = await StoreProduct.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Product not found" });

    const before = totalStock(existing);
    const data = sanitise(pickWritable(req.body));

    // Slug tabhi badlo jab admin ne khud bheja ho — purane link na tootein
    if (req.body.slug && req.body.slug !== existing.slug) {
      data.slug = await uniqueSlug(StoreProduct, req.body.slug, existing._id);
    }

    Object.assign(existing, data);
    await existing.save();

    const after = totalStock(existing);
    if (after !== before) {
      await StoreStockLog.create({
        product: existing._id, delta: after - before, before, after,
        reason: "admin_edit", by: req.admin?.email || "admin",
      });
    }

    res.json({ success: true, product: existing });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PATCH /:id/publish  — ek click mein live / band ── */
router.patch("/:id/publish", async (req, res) => {
  try {
    const p = await StoreProduct.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: "Product not found" });

    p.isPublished = req.body.isPublished !== undefined
      ? Boolean(req.body.isPublished)
      : !p.isPublished;
    await p.save();

    res.json({ success: true, isPublished: p.isPublished });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── DELETE /:id ──
   Jo product kabhi bika hai use mita nahi sakte, warna purane order ki
   line toot jaati hai. Aise product ko sirf band kar dete hain. */
router.delete("/:id", async (req, res) => {
  try {
    const p = await StoreProduct.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: "Product not found" });

    if ((p.soldCount || 0) > 0) {
      p.isPublished = false;
      await p.save();
      return res.json({
        success: true,
        archived: true,
        message: "Is product ke orders ho chuke hain, isliye hataya nahi — band kar diya gaya hai.",
      });
    }

    await p.deleteOne();
    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── POST /upload-image ──
   Wahi ImageKit account jo poori site use karti hai. Pehle compress,
   phir upload — phone se aayi 8 MB ki photo seedha nahi jaati. */
router.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image received" });

    const buffer = await sharp(req.file.path)
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const uploaded = await imagekit.upload({
      file: buffer,
      fileName: `product_${Date.now()}.jpg`,
      folder: "/valleystore/products",
    });

    cleanup(req.file);
    res.json({ success: true, url: uploaded.url, fileId: uploaded.fileId });
  } catch (err) {
    cleanup(req.file);
    console.error("store image upload:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

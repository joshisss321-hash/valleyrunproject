const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/auth");
const StoreCategory = require("../../models/store/StoreCategory");
const StoreProduct = require("../../models/store/StoreProduct");
const { uniqueSlug } = require("../../utils/store/orderNo");

router.use(protect);

const WRITABLE = [
  "name", "description", "image", "imageAlt",
  "sortOrder", "isPublished", "isFeatured",
  "seoTitle", "seoDescription",
];

const pickWritable = (body) => {
  const out = {};
  for (const k of WRITABLE) if (body[k] !== undefined) out[k] = body[k];
  return out;
};

/* ── GET /  — saari categories + har ek mein kitne products ── */
router.get("/", async (_req, res) => {
  try {
    const cats = await StoreCategory.find({}).sort({ sortOrder: 1, name: 1 }).lean();

    const counts = await StoreProduct.aggregate([
      { $unwind: "$categories" },
      { $group: { _id: "$categories", n: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));

    res.json({
      success: true,
      categories: cats.map((c) => ({ ...c, productCount: byId.get(String(c._id)) || 0 })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── POST / ── */
router.post("/", async (req, res) => {
  try {
    const data = pickWritable(req.body);
    if (!data.name || !String(data.name).trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    data.slug = await uniqueSlug(StoreCategory, req.body.slug || data.name);
    const category = await StoreCategory.create(data);

    res.status(201).json({ success: true, category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PUT /:id ── */
router.put("/:id", async (req, res) => {
  try {
    const cat = await StoreCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: "Category not found" });

    const data = pickWritable(req.body);
    if (req.body.slug && req.body.slug !== cat.slug) {
      data.slug = await uniqueSlug(StoreCategory, req.body.slug, cat._id);
    }

    Object.assign(cat, data);
    await cat.save();

    res.json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── DELETE /:id ──
   Category ke andar product hain to mitne nahi denge — warna wo products
   kisi category mein hi nahi rahenge aur listing se gayab ho jayenge. */
router.delete("/:id", async (req, res) => {
  try {
    const used = await StoreProduct.countDocuments({ categories: req.params.id });
    if (used > 0) {
      return res.status(400).json({
        success: false,
        message: `This category holds ${used} product${used === 1 ? "" : "s"}. Move them to another category first, or unpublish this category.`,
      });
    }

    const cat = await StoreCategory.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: "Category not found" });

    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

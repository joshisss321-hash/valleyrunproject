const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const sharp = require("sharp");
const ImageKit = require("imagekit");

const { protect } = require("../../middleware/auth");
const StoreProduct  = require("../../models/store/StoreProduct");
const StoreOrder    = require("../../models/store/StoreOrder");
const StoreStockLog = require("../../models/store/StoreStockLog");
const MedalSettings = require("../../models/store/MedalSettings");
const { slugify, uniqueSlug } = require("../../utils/store/orderNo");
const { available, sweepExpired, releaseOrder } = require("../../utils/store/medalStock");

const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const upload = multer({ dest: "uploads/", limits: { fileSize: 10 * 1024 * 1024 } });

router.use(protect);

/* ═══════════════════════════════════════════════════════════════
   MEDAL STORE — admin

   ⚠️ Har query mein `kind: "medal"` hai. Pahadi store ka ek bhi
   product ya order yahan se na dikhega na badla ja sakega.
   ═══════════════════════════════════════════════════════════════ */

const MEDAL = { kind: "medal" };

/* Medal ka admin roop — asli stock aur rok dono dikhte hain */
const adminMedal = (p) => ({
  ...p,
  availableStock: available(p),
  reserved: p.reserved || 0,
});

/* ═══════════════════════════════════════════════
   OVERVIEW
═══════════════════════════════════════════════ */
router.get("/overview", async (_req, res) => {
  try {
    await sweepExpired().catch(() => {});

    const [products, paidAgg, orderCount, pendingCount] = await Promise.all([
      StoreProduct.find(MEDAL).select("name slug stock reserved soldCount isPublished price").lean(),
      StoreOrder.aggregate([
        { $match: { kind: "medal", paymentStatus: "paid" } },
        { $group: { _id: null, revenue: { $sum: "$total" }, orders: { $sum: 1 },
                    units: { $sum: { $sum: "$items.qty" } } } },
      ]),
      StoreOrder.countDocuments({ kind: "medal" }),
      StoreOrder.countDocuments({ kind: "medal", paymentStatus: "paid", orderStatus: { $in: ["confirmed", "processing", "packed"] } }),
    ]);

    const agg = paidAgg[0] || { revenue: 0, orders: 0, units: 0 };
    const live = products.filter((p) => p.isPublished);

    res.json({
      success: true,
      enabled: String(process.env.MEDAL_STORE_ENABLED).toLowerCase() === "true",
      stats: {
        totalProducts: products.length,
        activeProducts: live.length,
        availableStock: products.reduce((s, p) => s + available(p), 0),
        heldStock: products.reduce((s, p) => s + (p.reserved || 0), 0),
        outOfStock: live.filter((p) => available(p) <= 0).length,
        medalsSold: agg.units || 0,
        paidOrders: agg.orders || 0,
        totalOrders: orderCount,
        toDispatch: pendingCount,
        revenue: agg.revenue || 0,
      },
      /* Jo khatam ho chuke — public se gayab hain par admin ko
         dikhne chahiye, warna pata hi nahi chalega ki bhar dena hai */
      outOfStock: live.filter((p) => available(p) <= 0)
        .map((p) => ({ _id: p._id, name: p.name, slug: p.slug, soldCount: p.soldCount || 0 })),
    });
  } catch (err) {
    console.error("medal overview:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   PRODUCTS
═══════════════════════════════════════════════ */

const WRITABLE = [
  "name", "shortDesc", "longDesc", "images", "featuredImage",
  "price", "mrp", "sku", "stock", "weightGm", "lowStockAt",
  "sourceRegion",                      // medal ke liye = event ka naam
  "isPublished", "isFeatured", "sortOrder",
  "shippingNote", "returnNote", "seoTitle", "seoDescription",
];

const pick = (body) => {
  const out = {};
  for (const k of WRITABLE) if (body[k] !== undefined) out[k] = body[k];
  return out;
};

const sanitise = (d) => {
  if (d.price    !== undefined) d.price    = Math.max(0, Number(d.price)    || 0);
  if (d.stock    !== undefined) d.stock    = Math.max(0, Math.floor(Number(d.stock) || 0));
  if (d.weightGm !== undefined) d.weightGm = Math.max(0, Number(d.weightGm) || 0);
  if (d.mrp      !== undefined) d.mrp      = d.mrp ? Number(d.mrp) : null;
  return d;
};

router.get("/products", async (req, res) => {
  try {
    const filter = { ...MEDAL };
    if (req.query.published === "1") filter.isPublished = true;
    if (req.query.published === "0") filter.isPublished = false;
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(safe, "i");
    }

    const rows = await StoreProduct.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    res.json({ success: true, medals: rows.map(adminMedal), total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const p = await StoreProduct.findOne({ _id: req.params.id, ...MEDAL }).lean();
    if (!p) return res.status(404).json({ success: false, message: "Medal not found" });
    res.json({ success: true, medal: adminMedal(p) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/products", async (req, res) => {
  try {
    const data = sanitise(pick(req.body));
    if (!data.name) return res.status(400).json({ success: false, message: "Medal name is required" });

    data.kind = "medal";
    data.variants = [];              // medals mein variants kabhi nahi
    data.slug = await uniqueSlug(StoreProduct, slugify(req.body.slug || data.name));

    const medal = await StoreProduct.create(data);

    if ((medal.stock || 0) > 0) {
      await StoreStockLog.create({
        product: medal._id, delta: medal.stock, before: 0, after: medal.stock,
        reason: "restock", by: req.admin?.email || "admin", note: "Pehla stock",
      }).catch(() => {});
    }

    res.status(201).json({ success: true, medal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/products/:id", async (req, res) => {
  try {
    const medal = await StoreProduct.findOne({ _id: req.params.id, ...MEDAL });
    if (!medal) return res.status(404).json({ success: false, message: "Medal not found" });

    const data = sanitise(pick(req.body));
    const before = medal.stock || 0;

    /* ⚠️ Stock ghatate waqt rok ka khayal rakhna hai. Agar 3 medal
       kisi ke checkout mein ruke hain aur admin stock 2 kar de, to
       jo paisa de chuke honge unka maal hi nahi bachega. Isliye
       rok se neeche nahi jaane dete. */
    if (data.stock !== undefined && data.stock < (medal.reserved || 0)) {
      return res.status(400).json({
        success: false,
        code: "BELOW_HELD",
        message:
          `${medal.reserved} ${medal.reserved === 1 ? "medal is" : "medals are"} held in a checkout ` +
          `right now, so stock cannot go below ${medal.reserved}. Try again in a few minutes.`,
      });
    }

    Object.assign(medal, data);

    // Slug tabhi badlo jab admin khud kahe — purane link toot jaate hain
    if (req.body.slug && slugify(req.body.slug) !== medal.slug) {
      medal.slug = await uniqueSlug(StoreProduct, slugify(req.body.slug), medal._id);
    }

    await medal.save();

    if (data.stock !== undefined && medal.stock !== before) {
      await StoreStockLog.create({
        product: medal._id, delta: medal.stock - before, before, after: medal.stock,
        reason: medal.stock > before ? "restock" : "admin_edit",
        by: req.admin?.email || "admin",
      }).catch(() => {});
    }

    res.json({ success: true, medal: adminMedal(medal.toObject()) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/products/:id/publish", async (req, res) => {
  try {
    const medal = await StoreProduct.findOne({ _id: req.params.id, ...MEDAL });
    if (!medal) return res.status(404).json({ success: false, message: "Medal not found" });

    medal.isPublished = req.body.isPublished !== undefined ? Boolean(req.body.isPublished) : !medal.isPublished;
    await medal.save();
    res.json({ success: true, medal: adminMedal(medal.toObject()) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Bika hua medal mitta nahi — uske orders ka record us product se
   juda hota hai. Sirf chhupa dete hain. */
router.delete("/products/:id", async (req, res) => {
  try {
    const medal = await StoreProduct.findOne({ _id: req.params.id, ...MEDAL });
    if (!medal) return res.status(404).json({ success: false, message: "Medal not found" });

    if ((medal.soldCount || 0) > 0) {
      medal.isPublished = false;
      await medal.save();
      return res.json({
        success: true, archived: true,
        message: `${medal.soldCount} already sold, so this medal was hidden instead of deleted — its orders need it.`,
      });
    }

    if ((medal.reserved || 0) > 0) {
      return res.status(400).json({
        success: false,
        message: "Someone is in checkout for this medal right now. Try again in a few minutes.",
      });
    }

    await StoreStockLog.deleteMany({ product: medal._id });
    await medal.deleteOne();
    res.json({ success: true, deleted: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Photo upload — Pahadi store wala hi tareeka, par apna folder */
router.post("/products/upload-image", upload.single("image"), async (req, res) => {
  const cleanup = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  };
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const buf = await sharp(req.file.path)
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    const up = await imagekit.upload({
      file: buf,
      fileName: `medal_${Date.now()}.jpg`,
      folder: "/valleyrun/medals",
    });
    cleanup();
    res.json({ success: true, url: up.url });
  } catch (err) {
    cleanup();
    console.error("medal image upload:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Stock ka itihaas */
router.get("/products/:id/stock-log", async (req, res) => {
  try {
    const rows = await StoreStockLog.find({ product: req.params.id })
      .sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, log: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   ORDERS
═══════════════════════════════════════════════ */

const { ORDER_STATUS } = require("../../models/store/StoreOrder");

router.get("/orders", async (req, res) => {
  try {
    await sweepExpired().catch(() => {});

    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const filter = { ...MEDAL };
    if (req.query.paymentStatus) filter.paymentStatus = String(req.query.paymentStatus);
    if (req.query.orderStatus)   filter.orderStatus   = String(req.query.orderStatus);
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ orderNo: rx }, { email: rx }, { phone: rx }, { name: rx }];
    }

    const [rows, total] = await Promise.all([
      StoreOrder.find(filter).sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      StoreOrder.countDocuments(filter),
    ]);

    res.json({ success: true, orders: rows, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const o = await StoreOrder.findOne({ _id: req.params.id, ...MEDAL }).lean();
    if (!o) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, order: o });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* Shipping status + tracking */
router.patch("/orders/:id/status", async (req, res) => {
  try {
    const o = await StoreOrder.findOne({ _id: req.params.id, ...MEDAL });
    if (!o) return res.status(404).json({ success: false, message: "Order not found" });

    const status = String(req.body.orderStatus || "");
    if (!ORDER_STATUS.includes(status)) {
      return res.status(400).json({ success: false, message: "Unknown status" });
    }

    /* Bina paise wale order ko bheja hua nahi bataya ja sakta — ye
       galti admin ko mehngi padti hai. */
    if (["processing", "packed", "shipped", "delivered"].includes(status) && o.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "This order has not been paid, so it cannot be marked as " + status + ".",
      });
    }

    o.orderStatus = status;
    if (req.body.courier     !== undefined) o.courier     = String(req.body.courier).slice(0, 80);
    if (req.body.trackingId  !== undefined) o.trackingId  = String(req.body.trackingId).slice(0, 80);
    if (req.body.trackingUrl !== undefined) o.trackingUrl = String(req.body.trackingUrl).slice(0, 300);
    if (req.body.adminNote   !== undefined) o.adminNote   = String(req.body.adminNote).slice(0, 500);

    if (status === "shipped"   && !o.shippedAt)   o.shippedAt = new Date();
    if (status === "delivered" && !o.deliveredAt) o.deliveredAt = new Date();

    /* Cancel karne par rok wapas — agar paisa nahi aaya tha.
       Paid order cancel karne par stock apne aap wapas NAHI aata:
       refund aur maal wapas lena admin ka faisla hai, uske baad wo
       khud stock badha sakta hai. Chup-chaap wapas kar dena galat
       ginti deta. */
    if (status === "cancelled") {
      o.cancelledAt = new Date();
      if (o.paymentStatus !== "paid") {
        await releaseOrder(o._id, "cancel").catch(() => {});
        o.paymentStatus = "cancelled";
        o.stockReserved = false;
      }
    }

    o.statusHistory.push({
      status,
      note: req.body.note || "",
      by: req.admin?.email || "admin",
      at: new Date(),
    });

    await o.save();
    res.json({
      success: true,
      order: o,
      message:
        status === "cancelled" && o.paymentStatus === "paid"
          ? "Cancelled. Stock was not added back — do that yourself after the refund and return."
          : "",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════ */
const SETTING_FIELDS = [
  "storeName", "tagline", "shippingFlat", "freeOver", "perExtraOff",
  "supportEmail", "supportPhone",
  "heroHeading", "heroText", "heroImage",
  "dispatchNote", "shippingPolicy", "returnPolicy", "notifyEmails",
];

router.get("/settings", async (_req, res) => {
  try {
    res.json({ success: true, settings: await MedalSettings.get() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const s = await MedalSettings.get();
    for (const k of SETTING_FIELDS) if (req.body[k] !== undefined) s[k] = req.body[k];

    s.shippingFlat = Math.max(0, Number(s.shippingFlat) || 0);
    s.freeOver     = Math.max(0, Number(s.freeOver) || 0);
    s.perExtraOff  = Math.max(0, Math.floor(Number(s.perExtraOff) || 0));
    s.notifyEmails = [...new Set((s.notifyEmails || [])
      .map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

    await s.save();
    res.json({ success: true, settings: s });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

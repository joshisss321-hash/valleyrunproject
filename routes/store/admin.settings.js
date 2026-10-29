const express = require("express");
const router = express.Router();

const { protect } = require("../../middleware/auth");
const StoreSettings = require("../../models/store/StoreSettings");

router.use(protect);

/* Client jo bheje wo seedha schema par nahi chipkate — sirf ye fields.
   `key` yahan jaan-bujh kar nahi hai: wo hamesha "store" rehta hai, warna
   doosra settings document ban jaata aur storefront purana padhta rehta. */
const WRITABLE = [
  "storeName", "tagline", "supportEmail", "supportPhone",

  "shippingMode", "shippingFlat", "shippingPerKg", "freeShippingOver",
  "serviceablePincodes",

  "codEnabled", "codCharge", "codMaxOrder",

  "fssaiNumber", "gstNumber", "legalEntityName", "legalAddress",
  "taxEnabled", "taxPercent",

  "shippingPolicy", "returnPolicy", "cancellationPolicy",
  "privacyPolicy", "terms", "aboutStore",

  "heroHeading", "heroSubtext", "heroImage", "heroCtaText", "heroCtaLink",
  "storyHeading", "storyBody", "storyImage",
  "faqs", "orderNotifyEmails",
];

const nonNeg = (v) => Math.max(0, Number(v) || 0);

/* Paise kabhi minus mein nahi, aur tax 0-100 ke beech hi */
const sanitise = (data) => {
  for (const k of ["shippingFlat", "shippingPerKg", "freeShippingOver", "codCharge", "codMaxOrder"]) {
    if (data[k] !== undefined) data[k] = nonNeg(data[k]);
  }
  if (data.taxPercent !== undefined) {
    data.taxPercent = Math.min(100, nonNeg(data.taxPercent));
  }
  if (data.shippingMode !== undefined && !["flat", "weight", "free"].includes(data.shippingMode)) {
    delete data.shippingMode;
  }
  if (Array.isArray(data.faqs)) {
    data.faqs = data.faqs
      .filter((f) => String(f?.q || "").trim())
      .map((f) => ({ q: String(f.q).trim(), a: String(f.a || "").trim() }));
  }
  if (Array.isArray(data.serviceablePincodes)) {
    // Sirf 6 ank wale — aadhe-adhure pincode se serviceability galat ho jaati
    data.serviceablePincodes = [
      ...new Set(data.serviceablePincodes.map((p) => String(p).trim()).filter((p) => /^\d{6}$/.test(p))),
    ];
  }
  if (Array.isArray(data.orderNotifyEmails)) {
    data.orderNotifyEmails = [
      ...new Set(data.orderNotifyEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)),
    ];
  }
  return data;
};

/* ── GET /  — poori settings (admin ke liye sab kuch) ── */
router.get("/", async (_req, res) => {
  try {
    const settings = await StoreSettings.get();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ── PUT / ── */
router.put("/", async (req, res) => {
  try {
    const settings = await StoreSettings.get();

    const data = {};
    for (const k of WRITABLE) if (req.body[k] !== undefined) data[k] = req.body[k];
    sanitise(data);

    Object.assign(settings, data);
    await settings.save();

    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

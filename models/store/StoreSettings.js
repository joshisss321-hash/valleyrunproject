const mongoose = require("mongoose");

/* Poore store ki settings — ek hi document. Admin panel se badalti hain,
   dobara deploy kiye bina. `get()` hamesha wahi ek document lautata hai,
   pehli baar khud bana deta hai. */
const storeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "store", unique: true },  // hamesha "store"

    storeName: { type: String, default: "Valley Store" },
    tagline:   { type: String, default: "" },

    supportEmail: { type: String, default: "" },
    supportPhone: { type: String, default: "" },

    /* ── Shipping ──
       flat   = har order par ek hi charge
       weight = weight ke hisaab se (perKgRate)
       free   = hamesha muft */
    shippingMode:    { type: String, enum: ["flat", "weight", "free"], default: "flat" },
    shippingFlat:    { type: Number, default: 0 },
    shippingPerKg:   { type: Number, default: 0 },
    freeShippingOver:{ type: Number, default: 0 },   // 0 = aisi koi chhoot nahi

    // Khali list = sab pincode par bhejte hain
    serviceablePincodes: { type: [String], default: [] },

    codEnabled: { type: Boolean, default: false },
    codCharge:  { type: Number,  default: 0 },
    codMaxOrder:{ type: Number,  default: 0 },

    /* ── Kanooni ──
       Abhi khali. FSSAI/GST milte hi yahan bhar dijiye — har product page
       aur har bill par apne aap aa jayega. Khali rehne par wo hissa
       dikhta hi nahi, jhoota dava nahi hota. */
    fssaiNumber:    { type: String, default: "" },
    gstNumber:      { type: String, default: "" },
    legalEntityName:{ type: String, default: "" },
    legalAddress:   { type: String, default: "" },
    taxEnabled:     { type: Boolean, default: false },
    taxPercent:     { type: Number,  default: 0 },

    currency: { type: String, default: "INR" },

    /* ── Policies — admin panel se badalti hain ── */
    shippingPolicy:     { type: String, default: "" },
    returnPolicy:       { type: String, default: "" },
    cancellationPolicy: { type: String, default: "" },
    privacyPolicy:      { type: String, default: "" },
    terms:              { type: String, default: "" },
    aboutStore:         { type: String, default: "" },

    /* ── Homepage ka content ── */
    heroHeading:  { type: String, default: "Bring the Goodness of the Himalayas Home." },
    heroSubtext:  { type: String, default: "" },
    heroImage:    { type: String, default: "" },
    heroCtaText:  { type: String, default: "Shop All Products" },
    heroCtaLink:  { type: String, default: "/store/search" },
    storyHeading: { type: String, default: "From Our Mountains to Your Home." },
    storyBody:    { type: String, default: "" },
    storyImage:   { type: String, default: "" },

    faqs: {
      type: [{ _id: false, q: String, a: String }],
      default: [],
    },

    orderNotifyEmails: { type: [String], default: [] },  // naye order par kise mail jaye
  },
  { timestamps: true }
);

/** Hamesha wahi ek document — na ho to bana deta hai. */
storeSettingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: "store" });
  if (!doc) doc = await this.create({ key: "store" });
  return doc;
};

module.exports = mongoose.model("StoreSettings", storeSettingsSchema);

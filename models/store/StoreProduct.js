const mongoose = require("mongoose");

/* Variant = ek hi product ke alag pack size: 250g / 500g / 1kg.
   Jaan-bujh kar product ke ANDAR rakha hai, alag collection mein nahi —
   stock ghatana ek hi document par atomic update ho jata hai, isliye do
   log ek saath khareedein to bhi stock minus mein nahi jaata. */
const variantSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },  // "500 g"
    sku:   { type: String, default: "", trim: true },

    price: { type: Number, required: true, min: 0 },
    mrp:   { type: Number, default: null },               // kaata hua daam

    stock:    { type: Number, default: 0, min: 0 },
    weightGm: { type: Number, default: 0 },               // shipping ka hisaab

    isActive: { type: Boolean, default: true },           // bik raha hai ya nahi
  },
  { _id: true }
);

const storeProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    shortDesc: { type: String, default: "" },
    longDesc:  { type: String, default: "" },

    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "StoreCategory" }],

    /* Images — pehli wali featured maani jaati hai, par featuredImage
       alag se bhi set ho sakti hai. ImageKit ke URL yahan aate hain,
       file kabhi database mein nahi. */
    images:        [{ url: String, alt: { type: String, default: "" } }],
    featuredImage: { type: String, default: "" },

    /* ── Daam aur stock ──
       Variants hain to unka price/stock chalta hai; nahi hain to ye wale.
       Dono jagah ka hisaab utils/storePricing.js ek jagah karta hai. */
    price:    { type: Number, default: 0, min: 0 },
    mrp:      { type: Number, default: null },
    sku:      { type: String, default: "", trim: true },
    stock:    { type: Number, default: 0, min: 0 },
    unit:     { type: String, default: "" },              // "500 g", "1 L"
    weightGm: { type: Number, default: 0 },

    variants: { type: [variantSchema], default: [] },

    // Stock itna ya kam bacha to admin ko dashboard par dikhega
    lowStockAt: { type: Number, default: 5 },

    /* ── Khane ke saamaan ki jaankari ── */
    ingredients:  { type: String, default: "" },
    sourceRegion: { type: String, default: "" },          // "Chamoli, Uttarakhand"
    storage:      { type: String, default: "" },
    shelfLife:    { type: String, default: "" },

    /* ── Kanooni jaankari ──
       Abhi khali hai. FSSAI/GST aane par sirf ye bharne hain — schema
       ya code dobara nahi badalna padega. Jab tak khali hai, product
       page par ye hissa dikhega hi nahi (jhoota dava nahi karenge). */
    fssaiNumber:  { type: String, default: "" },
    gstHsnCode:   { type: String, default: "" },
    sellerName:   { type: String, default: "" },
    sellerAddress:{ type: String, default: "" },
    packerName:   { type: String, default: "" },
    packerAddress:{ type: String, default: "" },
    countryOrigin:{ type: String, default: "India" },

    /* ── Dikhna / na dikhna ── */
    isPublished:  { type: Boolean, default: false },      // default BAND
    isFeatured:   { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    sortOrder:    { type: Number,  default: 0 },

    /* ── Shipping / return, per product ── */
    shippingNote: { type: String, default: "" },
    returnNote:   { type: String, default: "" },
    isReturnable: { type: Boolean, default: false },      // khane ka saamaan — default nahi

    seoTitle:       { type: String, default: "" },
    seoDescription: { type: String, default: "" },

    /* Bikri ka hisaab — best sellers isi se nikalte hain, har baar
       orders gin-gin kar nahi */
    soldCount: { type: Number, default: 0 },

    ratingAvg:   { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* Listing page ke liye: sirf published, category ke hisaab se, kram se */
storeProductSchema.index({ isPublished: 1, sortOrder: 1, createdAt: -1 });
storeProductSchema.index({ categories: 1, isPublished: 1 });
storeProductSchema.index({ isPublished: 1, isFeatured: 1 });
storeProductSchema.index({ isPublished: 1, isBestSeller: 1 });
// Search — naam, chhota description aur ilaaka
storeProductSchema.index({ name: "text", shortDesc: "text", sourceRegion: "text" });

module.exports = mongoose.model("StoreProduct", storeProductSchema);

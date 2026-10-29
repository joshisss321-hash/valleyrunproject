/**
 * Store ke daam aur stock ka hisaab — EK jagah.
 *
 * Product par bhi price/stock hai aur har variant par bhi. Agar har route
 * apna hisaab lagayega to listing kuch aur daam dikhayegi, cart kuch aur,
 * aur checkout teesra — Valley Run mein yahi galti category list ke saath
 * ho chuki hai. Isliye sab yahin se poochhenge.
 */

/** Variants wala product hai? */
const hasVariants = (p) => Array.isArray(p?.variants) && p.variants.some((v) => v.isActive !== false);

/** Sirf wo variants jo abhi bik rahe hain */
const activeVariants = (p) =>
  hasVariants(p) ? p.variants.filter((v) => v.isActive !== false) : [];

/**
 * Ek line ka asli daam aur stock.
 * variantId diya ho to usi ka, warna product ka apna.
 * Lautata hai: { ok, price, mrp, stock, label, sku, weightGm, reason? }
 */
const resolveLine = (product, variantId = null) => {
  if (!product) return { ok: false, reason: "Product not found" };
  if (!product.isPublished) return { ok: false, reason: "This product is not available" };

  if (hasVariants(product)) {
    if (!variantId) return { ok: false, reason: "Please choose a pack size" };

    const v = product.variants.find((x) => String(x._id) === String(variantId));
    if (!v) return { ok: false, reason: "That pack size is no longer available" };
    if (v.isActive === false) return { ok: false, reason: "That pack size is no longer available" };

    return {
      ok: true,
      price: Number(v.price) || 0,
      mrp: Number(v.mrp) || null,
      stock: Number(v.stock) || 0,
      label: v.label || "",
      sku: v.sku || "",
      weightGm: Number(v.weightGm) || 0,
    };
  }

  return {
    ok: true,
    price: Number(product.price) || 0,
    mrp: Number(product.mrp) || null,
    stock: Number(product.stock) || 0,
    label: product.unit || "",
    sku: product.sku || "",
    weightGm: Number(product.weightGm) || 0,
  };
};

/** Listing card ke liye: sabse sasta daam, aur "₹x – ₹y" dikhana hai ya nahi */
const priceRange = (product) => {
  const list = hasVariants(product)
    ? activeVariants(product).map((v) => ({ price: Number(v.price) || 0, mrp: Number(v.mrp) || null }))
    : [{ price: Number(product?.price) || 0, mrp: Number(product?.mrp) || null }];

  const prices = list.map((x) => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // MRP sirf tab dikhao jab wo asli daam se zyada ho — warna "discount"
  // dikhana jhooth hai
  const cheapest = list.find((x) => x.price === min) || list[0];
  const mrp = cheapest?.mrp && cheapest.mrp > min ? cheapest.mrp : null;

  return {
    priceFrom: min,
    priceTo: max,
    hasRange: max > min,
    mrp,
    discountPercent: mrp ? Math.round(((mrp - min) / mrp) * 100) : 0,
  };
};

/** Kahin bhi stock bacha hai? */
const totalStock = (product) =>
  hasVariants(product)
    ? activeVariants(product).reduce((n, v) => n + (Number(v.stock) || 0), 0)
    : Number(product?.stock) || 0;

const inStock = (product) => totalStock(product) > 0;

/**
 * Shipping ka hisaab — StoreSettings ke mutabik.
 * subtotal discount ke BAAD ka hona chahiye.
 */
const shippingFor = ({ settings, subtotal = 0, weightGm = 0 }) => {
  if (!settings) return 0;

  const freeOver = Number(settings.freeShippingOver) || 0;
  if (freeOver > 0 && subtotal >= freeOver) return 0;

  if (settings.shippingMode === "free") return 0;

  if (settings.shippingMode === "weight") {
    const kg = Math.max(1, Math.ceil((Number(weightGm) || 0) / 1000));
    return kg * (Number(settings.shippingPerKg) || 0);
  }

  return Number(settings.shippingFlat) || 0;
};

/** Public API ke liye product ka saaf roop — admin wale field bahar nahi jaate */
const publicProduct = (p) => {
  if (!p) return null;
  const range = priceRange(p);

  return {
    _id: p._id,
    name: p.name,
    slug: p.slug,
    shortDesc: p.shortDesc,
    longDesc: p.longDesc,
    images: p.images || [],
    featuredImage: p.featuredImage || p.images?.[0]?.url || "",
    categories: p.categories || [],
    unit: p.unit || "",

    ...range,
    inStock: inStock(p),

    variants: activeVariants(p).map((v) => ({
      _id: v._id,
      label: v.label,
      price: v.price,
      mrp: v.mrp && v.mrp > v.price ? v.mrp : null,
      inStock: (Number(v.stock) || 0) > 0,
    })),

    ingredients: p.ingredients || "",
    sourceRegion: p.sourceRegion || "",
    storage: p.storage || "",
    shelfLife: p.shelfLife || "",

    /* Kanooni jaankari — khali hai to bheji hi nahi jaati, taaki frontend
       khali heading na dikhaye */
    legal: [
      p.fssaiNumber   && { label: "FSSAI Lic. No.", value: p.fssaiNumber },
      p.sellerName    && { label: "Marketed by",    value: p.sellerName },
      p.packerName    && { label: "Packed by",      value: p.packerName },
      p.countryOrigin && { label: "Country of Origin", value: p.countryOrigin },
    ].filter(Boolean),

    shippingNote: p.shippingNote || "",
    returnNote: p.returnNote || "",
    isReturnable: Boolean(p.isReturnable),

    isFeatured: Boolean(p.isFeatured),
    isBestSeller: Boolean(p.isBestSeller),
    isNewArrival: Boolean(p.isNewArrival),

    /* Rating tabhi jab asli review ho — zero par frontend kuch nahi dikhayega */
    ratingAvg: p.ratingCount > 0 ? p.ratingAvg : 0,
    ratingCount: p.ratingCount || 0,

    seoTitle: p.seoTitle || "",
    seoDescription: p.seoDescription || "",
  };
};

module.exports = {
  hasVariants,
  activeVariants,
  resolveLine,
  priceRange,
  totalStock,
  inStock,
  shippingFor,
  publicProduct,
};

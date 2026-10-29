const Counter = require("../../models/Counter");

/**
 * Store order ka number: VS-2026-0001
 *
 * Wahi atomic Counter jo BIB numbers deta hai ($inc atomic hai), isliye
 * do log ek saath checkout karein to bhi ek number do baar nahi milega.
 * Saal ke hisaab se alag counter — har January se 0001 se shuru.
 */
const generateOrderNo = async (date = new Date()) => {
  const year = date.getFullYear();
  const seq = await Counter.next(`store-order:${year}`);
  return `VS-${year}-${String(seq).padStart(4, "0")}`;
};

/** Slug banana — naam se URL. "Pahadi Ghee 500g" → "pahadi-ghee-500g" */
const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Aisa slug jo pehle se kisi aur ke paas na ho.
 * Mil gaya to peeche -2, -3 lagta jaata hai.
 */
const uniqueSlug = async (Model, base, ignoreId = null) => {
  const root = slugify(base) || "item";
  let slug = root;
  let n = 1;

  while (true) {
    const query = { slug };
    if (ignoreId) query._id = { $ne: ignoreId };
    const clash = await Model.findOne(query).select("_id").lean();
    if (!clash) return slug;
    n += 1;
    slug = `${root}-${n}`;
  }
};

module.exports = { generateOrderNo, slugify, uniqueSlug };

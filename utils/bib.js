const Counter = require("../models/Counter");

/**
 * Event ke liye unique BIB number.
 * Format: VR-MON-0042  (VR + event abbreviation + running number)
 *
 * Counter collection atomic $inc use karta hai, isliye do log ek
 * saath register karein to bhi same BIB kabhi nahi milega.
 */
const generateBib = async (eventSlug) => {
  const abbr =
    String(eventSlug || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3) || "RUN";

  const seq = await Counter.next(`bib:${eventSlug}`);

  return `VR-${abbr}-${String(seq).padStart(4, "0")}`;
};

module.exports = { generateBib };

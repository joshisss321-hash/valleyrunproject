/**
 * Distance string → leaderboard category.
 *
 * Ye logic pehle leaderboard.routes.js ke andar tha. Profile page pe
 * bhi wahi rank chahiye, isliye yahan shift kiya — dono jagah bilkul
 * same category nikle, warna profile aur leaderboard alag rank dikhate.
 */

const CATEGORIES = [
  { label: "1600MTR", km: 1.6  },
  { label: "3.2KM",   km: 3.2  },
  { label: "5KM",     km: 5.0  },
  { label: "10KM",    km: 10.0 },
  { label: "21KM",    km: 21.0 },
];

function getNearestCategory(distStr) {
  if (!distStr) return null;
  const s = distStr.toLowerCase().trim();

  // ✅ Cycling pehle check karo
  if (s.includes("cycling")) {
    if (s.includes("100")) return "CYCLING100KM";
    if (s.includes("50"))  return "CYCLING50KM";
    if (s.includes("25"))  return "CYCLING25KM";
    return "CYCLING10KM";
  }

  // ✅ Walking check karo
  if (s.includes("walking") || s.includes("walk")) {
    if (s.includes("21")) return "WALKING21KM";
    if (s.includes("10")) return "WALKING10KM";
    if (s.includes("5"))  return "WALKING5KM";
    return "WALKING2KM";
  }

  // ✅ Running / default
  const upper = s.toUpperCase();
  if (upper.includes("1600") || s === "1.6km") return "1600MTR";

  const num = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return null;
  const km = (upper.includes("MTR") || (upper.includes("M") && !upper.includes("KM") && num > 100))
    ? num / 1000 : num;

  let nearest = CATEGORIES[0], minDiff = Infinity;
  CATEGORIES.forEach(cat => {
    const diff = Math.abs(cat.km - km);
    if (diff < minDiff) { minDiff = diff; nearest = cat; }
  });
  return nearest.label;
}

/**
 * Leaderboard ka sorting rule: valid timing wale pehle,
 * unme se tez pehle. Bina timing wale sabse aakhir mein.
 */
function sortByTiming(a, b) {
  const aValid = a.timingSeconds > 0;
  const bValid = b.timingSeconds > 0;
  if (aValid && bValid) return a.timingSeconds - b.timingSeconds;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}

module.exports = { CATEGORIES, getNearestCategory, sortByTiming };

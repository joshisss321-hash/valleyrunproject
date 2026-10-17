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

/* Cycling aur walking ki asli doorian.
   ⚠️ Ye frontend ke lib/categories.js ki list se milni chahiye — wahan naya
      option joda to yahan bhi jodiye, warna wo nazdeeki wali mein chala
      jayega aur leaderboard par do doorian ek saath dikhengi. */
const CYCLING_KM = [10, 25, 50, 60, 75, 85, 100];
const WALKING_KM = [2, 5, 10, 21];

/** String se number nikaal kar di gayi list mein sabse nazdeeki doori. */
function nearestOf(s, list, fallback) {
  const match = String(s).match(/(\d+(?:\.\d+)?)/);
  if (!match) return fallback;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return fallback;

  return list.reduce(
    (best, km) => (Math.abs(km - num) < Math.abs(best - num) ? km : best),
    list[0]
  );
}

function getNearestCategory(distStr) {
  if (!distStr) return null;
  const s = distStr.toLowerCase().trim();

  /* ✅ Cycling pehle check karo.
     Pehle yahan s.includes("50") jaisa substring match tha. Jab tak sirf
     10/25/50/100 the tab chal gaya, par 60/75/85 jodte hi sab tootta:
     "Cycling 60Km" mein na 100 hai, na 50, na 25 — to wo chupchaap
     CYCLING10KM ban jaata. Ab number nikaal kar nazdeeki doori par bhejte
     hain, jaise running mein hota hai. */
  if (s.includes("cycl")) {
    return `CYCLING${nearestOf(s, CYCLING_KM, 10)}KM`;
  }

  // ✅ Walking check karo — wahi substring wali dikkat thi yahan bhi
  if (s.includes("walking") || s.includes("walk")) {
    return `WALKING${nearestOf(s, WALKING_KM, 2)}KM`;
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

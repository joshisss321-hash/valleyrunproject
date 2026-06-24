// const express       = require("express");
// const router        = express.Router();
// const RunSubmission = require("../models/RunSubmission");

// // GET /api/leaderboard/:slug
// router.get("/:slug", async (req, res) => {
//   try {
//     const { slug }     = req.params;
//     const { distance } = req.query;

//     const filter = {
//       eventSlug: slug,
//       status:    "approved",
//     };
//     if (distance) filter.distance = distance;

//     const entries = await RunSubmission.find(filter)
//       .sort({ timingSeconds: 1 })
//       .lean();

//     const ranked = entries.map((e, i) => ({
//       rank:          i + 1,
//       name:          e.name,
//       distance:      e.distance,
//       timing:        e.timing || "—",
//       timingSeconds: e.timingSeconds,
//     }));

//     res.json({ success: true, entries: ranked });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// // module.exports = router;
// const express       = require("express");
// const router        = express.Router();
// const RunSubmission = require("../models/RunSubmission");

// // ✅ Nearest category finder
// const CATEGORIES = [
//   { label: "1600MTR", km: 1.6 },
//   { label: "3.2KM",   km: 3.2 },
//   { label: "5KM",     km: 5.0 },
//   { label: "10KM",    km: 10.0 },
//   { label: "21KM",    km: 21.0 },
// ];

// function parseKm(distStr) {
//   if (!distStr) return null;
//   const s = distStr.toUpperCase().trim();
//   // Handle "1600MTR", "1600M"
//   if (s.includes("1600") || s.includes("1.6KM")) return 1.6;
//   // Extract number
//   const num = parseFloat(s.replace(/[^0-9.]/g, ""));
//   if (isNaN(num)) return null;
//   // If meters (e.g. "1600")
//   if (s.includes("MTR") || s.includes("M") && !s.includes("KM") && num > 100) return num / 1000;
//   return num;
// }

// function getNearestCategory(distStr) {
//   const km = parseKm(distStr);
//   if (km === null) return null;
//   let nearest = CATEGORIES[0];
//   let minDiff = Infinity;
//   CATEGORIES.forEach(cat => {
//     const diff = Math.abs(cat.km - km);
//     if (diff < minDiff) { minDiff = diff; nearest = cat; }
//   });
//   return nearest.label;
// }

// // GET /api/leaderboard/:slug
// router.get("/:slug", async (req, res) => {
//   try {
//     const { slug }     = req.params;
//     const { distance } = req.query;

//     // Get all approved entries
//    const allEntries = await RunSubmission.find({
//   eventSlug: slug,
//   status: "approved",
// }).lean();

// // ✅ Valid timing wale pehle, baaki baad mein
// allEntries.sort((a, b) => {
//   const aValid = a.timingSeconds > 0;
//   const bValid = b.timingSeconds > 0;
//   if (aValid && bValid) return a.timingSeconds - b.timingSeconds;
//   if (aValid) return -1;
//   if (bValid) return 1;
//   return 0;
// });

//     let entries = allEntries;

//     if (distance) {
//       // Filter by nearest category
//       entries = allEntries.filter(e => {
//         const cat = getNearestCategory(e.distance);
//         // Frontend se "3.2KM" ya "3.2" dono handle karo
// const distUp = distance.toUpperCase();
// const distWithKM = distUp.includes("KM") || distUp.includes("MTR") 
//   ? distUp 
//   : distUp + "KM";
// return cat === distWithKM;
//       });
//     }

//     const ranked = entries.map((e, i) => ({
//       rank:          i + 1,
//       name:          e.name,
//       distance:      e.distance,
//       timing:        e.timing || "—",
//       timingSeconds: e.timingSeconds,
//     }));

//     res.json({ success: true, entries: ranked });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// module.exports = router;

const express       = require("express");
const router        = express.Router();
const RunSubmission = require("../models/RunSubmission");

// ✅ Categories — Running only (Walking & Cycling handled separately)
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

// GET /api/leaderboard/:slug
router.get("/:slug", async (req, res) => {
  try {
    const { slug }     = req.params;
    const { distance } = req.query;

    // Get all approved entries
    const allEntries = await RunSubmission.find({
      eventSlug: slug,
      status:    "approved",
    }).lean();

    // ✅ Valid timing wale pehle, baaki baad mein
    allEntries.sort((a, b) => {
      const aValid = a.timingSeconds > 0;
      const bValid = b.timingSeconds > 0;
      if (aValid && bValid) return a.timingSeconds - b.timingSeconds;
      if (aValid) return -1;
      if (bValid) return 1;
      return 0;
    });

    let entries = allEntries;

    if (distance) {
      // ✅ Filter by nearest category
      entries = allEntries.filter(e => {
        const cat = getNearestCategory(e.distance);
        const distUp = distance.toUpperCase();
        return cat === distUp;
      });
    }

    const ranked = entries.map((e, i) => ({
      rank:          i + 1,
      name:          e.name,
      distance:      e.distance,
      timing:        e.timing || "—",
      timingSeconds: e.timingSeconds,
    }));

    res.json({ success: true, entries: ranked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;

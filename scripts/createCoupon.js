/**
 * Coupon banane ki script.
 *
 *   node scripts/createCoupon.js                        → TEST50, 50% off, 100 uses
 *   node scripts/createCoupon.js EARLYBIRD 20           → EARLYBIRD, 20% off
 *   node scripts/createCoupon.js FLAT100 100 flat       → FLAT100, ₹100 off
 *   node scripts/createCoupon.js MONSOON 15 percent monsoon-run-2026
 *                                                       → sirf us event par
 *
 * Wahi code dobara chalao to purana update ho jata hai (duplicate error nahi).
 */
require("dotenv").config({ path: "./.env" });
const mongoose = require("mongoose");
const Coupon   = require("../models/Coupon");

const [, , codeArg, valueArg, typeArg, eventArg] = process.argv;

const code      = (codeArg || "TEST50").trim().toUpperCase();
const value     = Number(valueArg) || 50;
const type      = (typeArg || "percent").toLowerCase() === "flat" ? "flat" : "percent";
const eventSlug = eventArg || "";           // khaali = sabhi events par chalega
const maxUses   = 100;                      // test ke liye khula rakha hai
const days      = 90;

const run = async () => {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGO_URI / MONGODB_URI .env mein nahi mila");

    await mongoose.connect(uri);

    const coupon = await Coupon.findOneAndUpdate(
      { code },
      {
        code,
        kind:         "manual",
        discountType: type,
        value,
        maxUses,
        usedCount:    0,
        eventSlug,
        active:       true,
        expiresAt:    new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        note:         "Manually created via script",
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log("\n✅ Coupon ready\n");
    console.log("   Code      :", coupon.code);
    console.log("   Discount  :", type === "percent" ? `${value}%` : `₹${value}`);
    console.log("   Event     :", eventSlug || "sabhi events");
    console.log("   Max uses  :", maxUses);
    console.log("   Expires   :", coupon.expiresAt.toLocaleDateString("en-IN"));
    console.log("\n   Checkout par 'Coupon / Referral code' box mein ye daaliye.\n");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

run();

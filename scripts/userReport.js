/**
 * Ek runner ka poora hisaab — registrations, activities, medal, referral.
 *
 * Kuch badalta NAHI hai, sirf padhta hai. Support ki mail aaye to
 * pehle yahi chalaiye, saari tasveer ek jagah mil jayegi.
 *
 *   node scripts/userReport.js someone@gmail.com
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose      = require("mongoose");
const User          = require("../models/User");
const Registration  = require("../models/Registration");
const RunSubmission = require("../models/RunSubmission");
const Coupon        = require("../models/Coupon");
require("../models/Event");

const EMAIL = (process.argv[2] || "").toLowerCase().trim();

if (!EMAIL) {
  console.log("\nIstemaal:  node scripts/userReport.js someone@gmail.com\n");
  process.exit(1);
}

const line = () => console.log("─".repeat(64));
const d = (x) => (x ? new Date(x).toDateString() : "—");

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.log("\n❌ backend/.env mein MONGO_URI ya MONGODB_URI nahi mila.\n");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const user = await User.findOne({ email: EMAIL });
  if (!user) {
    console.log(`\n❌ Is email ka koi account nahi: ${EMAIL}\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("");
  line();
  console.log(`  ${user.name}   <${user.email}>`);
  line();
  console.log(`  Phone   : ${user.phone || "—"}`);
  console.log(`  Pata    : ${[user.address1, user.city, user.state, user.pincode].filter(Boolean).join(", ") || "—"}`);
  console.log(`  Joined  : ${d(user.createdAt)}`);
  console.log(`  Code    : ${user.referralCode || "—"}   (${user.referralCount || 0} referrals)`);

  /* ── Registrations ── */
  const regs = await Registration.find({ user: user._id })
    .populate("event", "title slug")
    .sort({ createdAt: 1 });

  console.log(`\n📋 Registrations: ${regs.length}`);
  regs.forEach((r, i) => {
    console.log(`\n   ${i + 1}. ${r.event?.title || r.eventSlug}`);
    console.log(`      BIB      : ${r.bibNumber || "— (assign nahi hua)"}`);
    console.log(`      Category : ${r.category}`);
    console.log(`      Paid     : ₹${r.amount || 0}${r.couponCode ? `  (coupon ${r.couponCode}, ₹${r.discountAmount} off)` : ""}`);
    console.log(`      Medal    : ${r.medalStatus}${r.trackingId ? `  ${r.courier || ""} ${r.trackingId}` : ""}`);
    console.log(`      Date     : ${d(r.createdAt)}`);
  });

  /* ── Activity submissions ── */
  const subs = await RunSubmission.find({ email: EMAIL }).sort({ createdAt: 1 });

  console.log(`\n🏃 Activity submissions: ${subs.length}`);
  subs.forEach((s, i) => {
    console.log(`\n   ${i + 1}. ${s.eventSlug}`);
    console.log(`      Distance : ${s.distance}`);
    console.log(`      Timing   : ${s.timing || "— (di hi nahi)"}`);
    console.log(`      Status   : ${s.status}${s.adminNote ? `  — ${s.adminNote}` : ""}`);
  });

  /* Registration hai par activity nahi — sabse aam sawaal */
  const subSlugs = new Set(subs.map((s) => s.eventSlug));
  const missing = regs.filter((r) => !subSlugs.has(r.eventSlug || r.event?.slug));
  if (missing.length) {
    console.log(`\n⚠️  In events mein registration hai par activity submit nahi hui:`);
    missing.forEach((r) => console.log(`      • ${r.event?.title || r.eventSlug}`));
  }

  /* ── Coupons ── */
  const coupons = await Coupon.find({ owner: user._id });
  if (coupons.length) {
    console.log(`\n🎁 Coupons: ${coupons.length}`);
    coupons.forEach((c) =>
      console.log(`      • ${c.code}  ${c.value}%  (${c.usedCount}/${c.maxUses} use)  ${c.active ? "active" : "band"}`)
    );
  }

  line();
  console.log("");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("\n❌ Gadbad:", err.message, "\n");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

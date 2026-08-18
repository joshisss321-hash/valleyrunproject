/**
 * Do accounts ko ek mein milata hai.
 *
 * Kabhi-kabhi log galti se doosri email se register kar lete hain, aur
 * fir chahte hain ki sab kuch ek hi login mein dikhe. Ye script FROM
 * wale account ka saara data TO wale account mein le jaati hai, aur
 * FROM account ko hata deti hai.
 *
 *   node scripts/mergeUsers.js --from purani@x.com --to nayi@x.com
 *       → sirf batata hai kya-kya hilega (kuch save NAHI karta)
 *
 *   node scripts/mergeUsers.js --from purani@x.com --to nayi@x.com --commit
 *       → asli merge
 *
 * ⚠️ Agar dono accounts ne EK HI event mein registration ki hai, to merge
 *    rok diya jaata hai — kyunki ek user ek event mein do baar register
 *    nahi ho sakta (DB ka unique rule). Aisi haalat mein pehle tay
 *    kijiye ki kaun si registration rakhni hai.
 */
// .env script ki apni jagah se dhoondho — terminal kahin se bhi chalaya jaye,
// chalega. ("./.env" hota to sirf backend folder ke andar se hi chalta.)
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose      = require("mongoose");
const User          = require("../models/User");
const Registration  = require("../models/Registration");
const RunSubmission = require("../models/RunSubmission");
const Coupon        = require("../models/Coupon");
require("../models/Event"); // populate ke liye

/* ── Command line ── */
const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};

const FROM   = (arg("--from") || "").toLowerCase().trim();
const TO     = (arg("--to")   || "").toLowerCase().trim();
const COMMIT = process.argv.includes("--commit");

if (!FROM || !TO) {
  console.log("\nIstemaal:");
  console.log("  node scripts/mergeUsers.js --from purani@x.com --to nayi@x.com");
  console.log("  node scripts/mergeUsers.js --from purani@x.com --to nayi@x.com --commit\n");
  process.exit(1);
}

if (FROM === TO) {
  console.log("\n❌ Dono email ek hi hain. Kuch karne ko nahi.\n");
  process.exit(1);
}

const line = () => console.log("─".repeat(64));

(async () => {
  // Production mein MONGO_URI, local .env mein MONGODB_URI — dono chalte hain
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.log("\n❌ Database ka pata nahi mila.");
    console.log("   backend/.env mein MONGO_URI ya MONGODB_URI hona chahiye.\n");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const from = await User.findOne({ email: FROM });
  const to   = await User.findOne({ email: TO });

  if (!from) { console.log(`\n❌ Account nahi mila: ${FROM}\n`); process.exit(1); }
  if (!to)   { console.log(`\n❌ Account nahi mila: ${TO}\n`);   process.exit(1); }

  console.log("");
  line();
  console.log(COMMIT ? "  MERGE — asli badlav" : "  MERGE — sirf jaanch (kuch save nahi hoga)");
  line();
  console.log(`  Se : ${from.name}  <${from.email}>   joined ${from.createdAt?.toDateString()}`);
  console.log(`  Mein: ${to.name}  <${to.email}>   joined ${to.createdAt?.toDateString()}`);
  line();

  /* ── 1. Registrations ── */
  const fromRegs = await Registration.find({ user: from._id }).populate("event", "title slug");
  const toRegs   = await Registration.find({ user: to._id }).populate("event", "title slug");

  const toEventIds = new Set(toRegs.map((r) => String(r.event?._id || r.event)));
  const clash = fromRegs.filter((r) => toEventIds.has(String(r.event?._id || r.event)));

  console.log(`\n📋 Registrations`);
  console.log(`   ${FROM} ke paas : ${fromRegs.length}`);
  fromRegs.forEach((r) =>
    console.log(`      • ${r.event?.title || r.eventSlug}  (BIB ${r.bibNumber || "—"})`)
  );
  console.log(`   ${TO} ke paas   : ${toRegs.length}`);
  toRegs.forEach((r) =>
    console.log(`      • ${r.event?.title || r.eventSlug}  (BIB ${r.bibNumber || "—"})`)
  );

  if (clash.length) {
    console.log(`\n❌ RUK GAYE — dono accounts ne ye event(s) mein registration ki hai:`);
    clash.forEach((r) => console.log(`      • ${r.event?.title || r.eventSlug}`));
    console.log(`\n   Ek user ek event mein do baar register nahi ho sakta.`);
    console.log(`   Pehle tay kijiye kaun si registration rakhni hai, purani hata dijiye,`);
    console.log(`   fir ye script dobara chalaiye.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  /* ── 2. Activity submissions (email se jude hote hain) ── */
  const fromSubs = await RunSubmission.find({ email: FROM });
  const toSubs   = await RunSubmission.find({ email: TO });

  const toSlugs   = new Set(toSubs.map((s) => s.eventSlug));
  const subClash  = fromSubs.filter((s) => toSlugs.has(s.eventSlug));

  console.log(`\n🏃 Activity submissions`);
  console.log(`   ${FROM} ke paas : ${fromSubs.length}`);
  fromSubs.forEach((s) =>
    console.log(`      • ${s.eventSlug}  ${s.distance}  ${s.timing || "no timing"}  [${s.status}]`)
  );
  console.log(`   ${TO} ke paas   : ${toSubs.length}`);

  if (subClash.length) {
    console.log(`\n❌ RUK GAYE — dono ne ek hi event ki activity submit ki hai:`);
    subClash.forEach((s) => console.log(`      • ${s.eventSlug}`));
    console.log(`\n   Ek event mein ek hi submission ho sakti hai. Pehle ek hataiye.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  /* ── 3. Referral ── */
  const fromCoupons = await Coupon.find({ owner: from._id });
  const referredByFrom = await User.find({ referredBy: from._id }).select("email");

  console.log(`\n🎁 Referral`);
  console.log(`   Coupons ${FROM} ke naam    : ${fromCoupons.length}`);
  fromCoupons.forEach((c) => console.log(`      • ${c.code}  ${c.value}%  (${c.usedCount}/${c.maxUses} use)`));
  console.log(`   ${FROM} ke code se aaye log: ${referredByFrom.length}`);
  console.log(`   referralCount              : ${from.referralCount} → ${TO} mein jud kar ${to.referralCount + from.referralCount}`);

  /* ── 4. joinedEvents ── */
  const merged = [...(to.joinedEvents || [])];
  (from.joinedEvents || []).forEach((je) => {
    if (!merged.some((m) => m.eventSlug === je.eventSlug)) merged.push(je);
  });

  console.log(`\n📅 joinedEvents : ${to.joinedEvents?.length || 0} + ${from.joinedEvents?.length || 0} → ${merged.length}`);

  /* ── Dry run yahin khatam ── */
  if (!COMMIT) {
    line();
    console.log("  Kuch save nahi hua. Karne ke liye wahi command --commit ke saath chalaiye.");
    line();
    console.log("");
    await mongoose.disconnect();
    return;
  }

  /* ── Asli badlav ──
     Sab kuch ek transaction mein. Beech mein connection toota to
     MongoDB khud sab wapas kar dega — aadha merge kabhi nahi hoga. */
  console.log("\n⏳ Merge ho raha hai…\n");

  const session = await mongoose.startSession();
  let usedTransaction = true;

  const steps = async (opts) => {
    const r1 = await Registration.updateMany({ user: from._id }, { $set: { user: to._id } }, opts);
    console.log(`   ✔ ${r1.modifiedCount} registration ${TO} ke naam`);

    const r2 = await RunSubmission.updateMany({ email: FROM }, { $set: { email: TO } }, opts);
    console.log(`   ✔ ${r2.modifiedCount} submission ${TO} ke naam`);

    const r3 = await Coupon.updateMany({ owner: from._id }, { $set: { owner: to._id } }, opts);
    console.log(`   ✔ ${r3.modifiedCount} coupon ${TO} ke naam`);

    const r4 = await User.updateMany(
      { referredBy: from._id },
      { $set: { referredBy: to._id, referredByCode: to.referralCode || "" } },
      opts
    );
    console.log(`   ✔ ${r4.modifiedCount} referred user ab ${TO} se jude`);

    to.joinedEvents          = merged;
    to.referralCount         = (to.referralCount || 0) + (from.referralCount || 0);
    to.referralRewardsIssued = (to.referralRewardsIssued || 0) + (from.referralRewardsIssued || 0);

    // Pata sirf tab bharo jab TO ke paas hai hi nahi
    if (!to.address1 && from.address1) {
      ["address1", "address2", "landmark", "city", "state", "pincode"].forEach((f) => {
        if (from[f]) to[f] = from[f];
      });
      console.log(`   ✔ pata ${FROM} se copy kiya (${TO} ka khaali tha)`);
    }

    // Coach tip stats badal gaye — dobara ban jayegi
    to.coachTip = { text: "", signature: "", generatedAt: null };

    await to.save(opts);
    console.log(`   ✔ ${TO} ka profile update`);

    await User.deleteOne({ _id: from._id }, opts);
    console.log(`   ✔ ${FROM} account hata diya`);
  };

  try {
    await session.withTransaction(() => steps({ session }));
  } catch (err) {
    // Purane/standalone MongoDB par transaction nahi chalti — bina uske karo
    const noTxn = /Transaction|replica set|not supported/i.test(err.message);
    if (!noTxn) throw err;

    usedTransaction = false;
    console.log("   ⚠️  Is database par transaction nahi chalti — seedha kar rahe hain\n");
    await steps({});
  } finally {
    await session.endSession();
  }

  line();
  console.log(`  ✅ Ho gaya. ${TO} se login karke sab kuch ek jagah dikhega.`);
  if (!usedTransaction) {
    console.log(`  ⚠️  Transaction ke bina hua — upar ki har line ✔ hai to sab theek hai.`);
  }
  line();
  console.log("");

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("\n❌ Gadbad:", err.message, "\n");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

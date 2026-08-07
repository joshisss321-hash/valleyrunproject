/**
 * OTP kyun nahi aa raha — iska jawab dene wali script.
 *
 *   node scripts/otpDebug.js you@email.com
 *       → batata hai kitne OTP bane, cooldown baaki hai ya nahi,
 *         window limit lagi hai ya nahi
 *
 *   node scripts/otpDebug.js you@email.com --reset
 *       → is email ke saare OTP records mita deta hai
 *         (turant dobara OTP maang sakte hain — testing ke liye)
 *
 *   node scripts/otpDebug.js you@email.com --test-email
 *       → ek asli test email bhejta hai. Aa gaya to Brevo theek hai,
 *         nahi aaya to dikkat Brevo ki taraf hai.
 */
require("dotenv").config({ path: "./.env" });
const mongoose  = require("mongoose");
const Otp       = require("../models/Otp");
const User      = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const {
  RESEND_COOLDOWN_SEC,
  MAX_PER_WINDOW,
  WINDOW_MIN,
  OTP_TTL_MIN,
} = require("../utils/otp");

const args  = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) || "").toLowerCase().trim();
const reset = args.includes("--reset");
const test  = args.includes("--test-email");

const run = async () => {
  try {
    if (!email) {
      console.log("\nEmail do:\n  node scripts/otpDebug.js you@email.com [--reset] [--test-email]\n");
      process.exit(1);
    }

    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGO_URI / MONGODB_URI .env mein nahi mila");
    await mongoose.connect(uri);

    /* ── 1. User hai ya nahi ── */
    const user = await User.findOne({ email });
    console.log(`\n${"═".repeat(58)}`);
    console.log(`  OTP DEBUG — ${email}`);
    console.log("═".repeat(58));

    if (!user) {
      console.log("\n❌ Is email se koi USER hi nahi hai.");
      console.log("   OTP sirf registered runners ko jaata hai.");
      console.log("   Login karne se pehle kisi event mein registration honi chahiye.\n");
      process.exit(0);
    }
    console.log(`\n✅ User mila: ${user.name}  (phone ${user.phone || "—"})`);

    /* ── 2. Current settings ── */
    console.log(`\n  Settings (is LOCAL code ki — deployed server ki alag ho sakti hai):`);
    console.log(`    Do OTP ke beech gap     : ${RESEND_COOLDOWN_SEC} second`);
    console.log(`    ${WINDOW_MIN} min mein max        : ${MAX_PER_WINDOW} OTP`);
    console.log(`    OTP kitni der valid     : ${OTP_TTL_MIN} min`);

    /* ── 3. Reset ── */
    if (reset) {
      const del = await Otp.deleteMany({ email });
      console.log(`\n🧹 ${del.deletedCount} OTP records mita diye — ab turant naya OTP maang sakte hain.`);
    }

    /* ── 4. Abhi ki haalat ── */
    const windowStart = new Date(Date.now() - WINDOW_MIN * 60 * 1000);
    const inWindow = await Otp.find({ email, createdAt: { $gte: windowStart } })
      .sort({ createdAt: 1 }).lean();
    const last = await Otp.findOne({ email }).sort({ createdAt: -1 }).lean();

    console.log(`\n  Abhi ki haalat:`);
    console.log(`    Pichle ${WINDOW_MIN} min mein bane : ${inWindow.length} / ${MAX_PER_WINDOW}`);

    let blocked = false;

    if (last) {
      const elapsed = Math.floor((Date.now() - new Date(last.createdAt)) / 1000);
      console.log(`    Aakhri OTP bana           : ${elapsed} second pehle`);

      if (elapsed < RESEND_COOLDOWN_SEC) {
        blocked = true;
        console.log(`\n⛔ COOLDOWN chal raha hai — ${RESEND_COOLDOWN_SEC - elapsed} second aur rukna hoga.`);
      }
    } else {
      console.log(`    Aakhri OTP bana           : kabhi nahi`);
    }

    if (inWindow.length >= MAX_PER_WINDOW) {
      blocked = true;
      const freeAt  = new Date(new Date(inWindow[0].createdAt).getTime() + WINDOW_MIN * 60 * 1000);
      const waitMin = Math.max(1, Math.ceil((freeAt - Date.now()) / 60000));
      console.log(`\n⛔ WINDOW LIMIT lagi hai — ${waitMin} minute baad hi agla OTP milega.`);
      console.log(`   Ye wahi wajah hai jisme Brevo tak request jaati hi nahi,`);
      console.log(`   isliye Brevo ke logs mein OTP dikhta bhi nahi.`);
    }

    /* Purana deployed code 5 par hi rok deta tha — us haalat ko alag se batao */
    if (!blocked && inWindow.length >= 5) {
      console.log(`\n⚠️  Yahan ${inWindow.length} OTP dikh rahe hain.`);
      console.log(`   Is local code ki limit ${MAX_PER_WINDOW} hai, par agar aapke SERVER par`);
      console.log(`   abhi purana code chal raha hai (limit 5), to wahan block ho chuke honge.`);
      console.log(`   --reset chala kar turant khol sakte hain.`);
      blocked = true;
    }

    if (!blocked) {
      console.log(`\n✅ Koi rok nahi hai — abhi OTP maangenge to jaana chahiye.`);
      console.log(`   Agar phir bhi na aaye to gadbad Brevo ki taraf hai (--test-email chalaiye).`);
    }

    /* ── 5. Test email ── */
    if (test) {
      console.log(`\n📧 Test email bhej rahe hain ${email} par...`);
      const ok = await sendEmail({
        to:      email,
        subject: "Valley Run — email test",
        html: `<p>Ye ek test email hai.</p>
               <p>Aap tak pahunch gayi, matlab Brevo theek kaam kar raha hai
               aur OTP na aane ki wajah rate limit hai, email nahi.</p>`,
      });

      console.log(ok
        ? "   ✅ Brevo ne accept kar liya. Inbox (aur SPAM folder) dekhiye."
        : "   ❌ Brevo ne MANA kar diya — upar ki error line dekhiye.\n" +
          "      Aam wajah: BREVO_API_KEY galat, ya daily quota (free plan = 300/din) khatam.");
    }

    console.log(`\n${"═".repeat(58)}\n`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

run();

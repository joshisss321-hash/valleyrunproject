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
 *
 *   node scripts/otpDebug.js --brevo
 *       → Brevo se seedha poochta hai: plan kya hai, kitne email
 *         credits bache hain. Quota khatam hai to yahi batayega.
 *
 *   node scripts/otpDebug.js you@email.com --smtp
 *       → Gmail SMTP se asli OTP email bhejta hai (Brevo ko bilkul
 *         chhue bina). Ye chal gaya to login ki dikkat khatam.
 *
 *   node scripts/otpDebug.js you@email.com --test-otp
 *       → BILKUL WAHI OTP email bhejta hai jo login karta hai (wahi
 *         subject, wahi template) aur Brevo ka KACCHA jawab dikhata
 *         hai. Registration mail ja rahi ho par OTP na ja raha ho,
 *         to iska jawab yahi batayega.
 *
 *   node scripts/otpDebug.js you@email.com --code
 *       → email ka intezaar kiye bina ek OTP banata hai aur yahin
 *         screen par dikha deta hai. Use login page par daal dijiye.
 *         Email atki ho tab bhi testing ruk nahi jaati.
 */
require("dotenv").config({ path: "./.env" });
const https     = require("https");
const mongoose  = require("mongoose");
const Otp       = require("../models/Otp");
const User      = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const {
  RESEND_COOLDOWN_SEC,
  MAX_PER_WINDOW,
  WINDOW_MIN,
  OTP_TTL_MIN,
  generateCode,
  hashCode,
} = require("../utils/otp");

const args  = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) || "").toLowerCase().trim();
const reset = args.includes("--reset");
const test  = args.includes("--test-email");
const brevo = args.includes("--brevo");
const wantCode = args.includes("--code");
const testOtp  = args.includes("--test-otp");
const testSmtp = args.includes("--smtp");

/**
 * Brevo ko seedha wahi payload bhejta hai jo OTP login bhejta hai,
 * aur Brevo ka jawab jaisa hai waisa dikhata hai — koi chhupav nahi.
 */
const rawBrevoSend = ({ to, subject, html }) =>
  new Promise((resolve) => {
    const payload = JSON.stringify({
      sender: { name: "Valley Run", email: process.env.EMAIL_REPLY_TO },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });

    const req = https.request(
      {
        hostname: "api.brevo.com",
        path:     "/v3/smtp/email",
        method:   "POST",
        headers: {
          "Content-Type":   "application/json",
          "api-key":        process.env.BREVO_API_KEY,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", (e) => resolve({ status: 0, body: e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 0, body: "timeout" }); });
    req.write(payload);
    req.end();
  });

/** Brevo se account info — kitne email credits bache hain */
const brevoAccount = () =>
  new Promise((resolve) => {
    if (!process.env.BREVO_API_KEY) {
      return resolve({ error: "BREVO_API_KEY .env mein hai hi nahi" });
    }

    const req = https.request(
      {
        hostname: "api.brevo.com",
        path:     "/v3/account",
        method:   "GET",
        headers:  { "api-key": process.env.BREVO_API_KEY, Accept: "application/json" },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(raw);
            resolve(res.statusCode === 200 ? { data: json } : { error: json.message || raw });
          } catch {
            resolve({ error: `Brevo ne ajeeb jawab diya (HTTP ${res.statusCode})` });
          }
        });
      }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ error: "Brevo timeout" }); });
    req.end();
  });

const showBrevo = async () => {
  console.log(`\n${"═".repeat(58)}`);
  console.log("  BREVO ACCOUNT");
  console.log("═".repeat(58));

  const { data, error } = await brevoAccount();

  if (error) {
    console.log(`\n❌ ${error}`);
    console.log("   Iska matlab OTP email ja hi nahi sakti.\n");
    return;
  }

  console.log(`\n  Account : ${data.email || "—"}`);
  console.log(`  Company : ${data.companyName || "—"}`);

  const plans = data.plan || [];
  let emailCredits = null;

  plans.forEach((p) => {
    const label = p.type === "free" ? "Free plan" : p.type;
    if (p.credits !== undefined) {
      console.log(`  ${label.padEnd(12)}: ${p.credits} credits bache (${p.creditsType || "?"})`);
      if ((p.creditsType || "").toLowerCase().includes("email")) emailCredits = p.credits;
    } else {
      console.log(`  ${label.padEnd(12)}: ${JSON.stringify(p)}`);
    }
  });

  if (emailCredits !== null) {
    if (emailCredits <= 0) {
      console.log(`\n⛔ EMAIL CREDITS KHATAM. Yahi wajah hai OTP na aane ki.`);
      console.log(`   Free plan par roz 300 emails milti hain aur aadhi raat ko reset hoti hain.`);
      console.log(`   Tracking sheet 2-3 baar upload karne se ye jaldi khatam ho jaate hain.`);
    } else if (emailCredits < 30) {
      console.log(`\n⚠️  Sirf ${emailCredits} credits bache hain — jald khatam ho jayenge.`);
    } else {
      console.log(`\n✅ ${emailCredits} credits bache hain — quota ki dikkat nahi hai.`);
    }
  }
  console.log(`\n${"═".repeat(58)}\n`);
};

const run = async () => {
  try {
    if (brevo && !email) {
      await showBrevo();
      process.exit(0);
    }

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

    /* ── Gmail SMTP se asli OTP email ── */
    if (testSmtp) {
      const sendEmailSmtp = require("../utils/sendEmailSmtp");

      if (!sendEmailSmtp.isConfigured()) {
        console.log("\n❌ EMAIL_USER / EMAIL_PASS .env mein nahi hain.");
        console.log("   EMAIL_PASS Google App Password hona chahiye.\n");
      } else {
        const otpEmail = require("../utils/emailTemplates/otpEmail");
        const code = generateCode();

        console.log(`\n📤 Gmail SMTP se OTP email bhej rahe hain...`);
        console.log(`   To   : ${email}`);
        console.log(`   From : ${process.env.EMAIL_USER}`);

        const ok = await sendEmailSmtp({
          to: email,
          subject: "Your Valley Run sign-in code",
          html: otpEmail({ name: user.name, code, ttlMinutes: OTP_TTL_MIN }),
        });

        if (ok) {
          // Bheja hai to DB mein bhi daal do — ye code sach mein chalega
          await Otp.updateMany({ email, consumed: false }, { consumed: true });
          await Otp.create({
            email, codeHash: hashCode(code),
            expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000), ip: "smtp-test",
          });
          console.log(`\n✅ Chali gayi! Inbox dekhiye — code ${code} hai.`);
          console.log(`   Ye code login page par sach mein kaam karega.`);
        } else {
          console.log(`\n⛔ SMTP se bhi nahi gayi — upar wali wajah dekhiye.`);
        }
      }
    }

    /* ── Asli OTP email + Brevo ka kaccha jawab ── */
    if (testOtp) {
      if (!process.env.BREVO_API_KEY) {
        console.log("\n❌ BREVO_API_KEY .env mein nahi hai.");
        console.log("   Render → aapki service → Environment se copy karke");
        console.log("   local .env mein daal dijiye, phir ye command chalaiye.\n");
        process.exit(1);
      }

      const otpEmail = require("../utils/emailTemplates/otpEmail");
      const code     = generateCode();
      const subject  = `${code} is your Valley Run login code`;

      console.log(`\n📤 Wahi OTP email bhej rahe hain jo login bhejta hai...`);
      console.log(`   To      : ${email}`);
      console.log(`   Subject : ${subject}`);
      console.log(`   Sender  : ${process.env.EMAIL_REPLY_TO}`);

      const r = await rawBrevoSend({
        to: email,
        subject,
        html: otpEmail({ name: user.name, code, ttlMinutes: OTP_TTL_MIN }),
      });

      console.log(`\n  ── BREVO KA JAWAB ──────────────────────────`);
      console.log(`  HTTP ${r.status}`);
      console.log(`  ${r.body}`);
      console.log(`  ────────────────────────────────────────────`);

      if (r.status >= 200 && r.status < 300) {
        console.log(`\n✅ Brevo ne SWEEKAR kar liya (messageId upar hai).`);
        console.log(`   Ab Brevo → Logs mein isi messageId ko dhoondhiye.`);
        console.log(`   Wahan na mile to Brevo support ka mamla hai.`);
        console.log(`   Wahan "Blocked"/"Bounce" dikhe to us address ki dikkat hai.`);
      } else {
        console.log(`\n⛔ Brevo ne MANA kar diya — upar wali line hi asli wajah hai.`);
      }
    }

    /* ── Email ke bina OTP — testing ke liye ── */
    if (wantCode) {
      await Otp.updateMany({ email, consumed: false }, { consumed: true });

      const code = generateCode();
      await Otp.create({
        email,
        codeHash:  hashCode(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60 * 1000),
        ip:        "script",
      });

      console.log(`\n  ┌──────────────────────┐`);
      console.log(`  │   OTP:  ${code}     │`);
      console.log(`  └──────────────────────┘`);
      console.log(`\n  Ise login page par daal dijiye — ${OTP_TTL_MIN} minute valid hai.`);
      console.log(`  Koi email nahi jaayegi, isliye Brevo ki dikkat se farak nahi padta.`);
    }

    console.log(`\n${"═".repeat(58)}\n`);

    if (brevo) await showBrevo();

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

run();

const crypto  = require("crypto");
const User    = require("../models/User");
const Coupon  = require("../models/Coupon");
const sendEmail = require("./sendEmail");

/* ── RULES (ek jagah, taaki badalna aasan rahe) ──────────────
   Referrer: har paid referral pe 2% judta hai, max 20% tak.
   Jo join karta hai: hamesha 1% instant.
   Coupon use hote hi referrer ka counter zero se shuru.        */
const WELCOME_PERCENT       = 2;   // naye bande ko turant
const REWARD_PER_REFERRAL   = 2;   // referrer ko har referral pe
const REWARD_MAX_PERCENT    = 20;  // isse upar nahi badhega
const REWARD_VALID_DAYS     = 180;

/* Confusing characters (0/O, 1/I/L) hata diye — log code type karte hain */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const randomChunk = (len) =>
  Array.from(
    { length: len },
    () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]
  ).join("");

/**
 * User ke naam se readable referral code banata hai — "SONU7K2M".
 * Collision pe naye random chunk ke saath retry karta hai.
 */
const ensureReferralCode = async (user) => {
  if (user.referralCode) return user.referralCode;

  const base =
    (user.name || "RUN")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4) || "RUN";

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${base}${randomChunk(4)}`;
    const clash = await User.exists({ referralCode: candidate });
    if (clash) continue;

    try {
      user.referralCode = candidate;
      await user.save();
      return candidate;
    } catch (err) {
      // Race: kisi aur ne wahi code le liya — dobara try karo
      if (err.code !== 11000) throw err;
      user.referralCode = undefined;
    }
  }

  // 10 attempts ke baad bhi na mile to poora random (practically kabhi nahi hoga)
  const fallback = `VR${randomChunk(8)}`;
  user.referralCode = fallback;
  await user.save();
  return fallback;
};

/**
 * Checkout pe daala gaya code resolve karta hai — chahe wo admin coupon ho
 * ya kisi runner ka referral code.
 *
 * Returns: { ok, discount, message, couponCode, kind, referrerId?, coupon? }
 */
const resolveDiscount = async ({ code, email, amount, eventSlug }) => {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return { ok: false, message: "Please enter a code" };

  const base       = Number(amount) || 0;
  const buyerEmail = String(email || "").toLowerCase().trim();

  /* ── 1. Pehle normal coupon dhundo ─────────────────────── */
  const coupon = await Coupon.findOne({ code: clean });

  if (coupon) {
    const usable = coupon.checkUsable({ email: buyerEmail, amount: base, eventSlug });
    if (!usable.ok) return { ok: false, message: usable.message };

    const discount = coupon.calcDiscount(base);
    if (discount <= 0) {
      return { ok: false, message: "This discount does not apply to this amount" };
    }

    return {
      ok:         true,
      discount,
      couponCode: coupon.code,
      kind:       coupon.kind,
      coupon,
      message:
        coupon.discountType === "percent"
          ? `${coupon.value}% off applied — you saved ₹${discount}!`
          : `₹${discount} off applied!`,
    };
  }

  /* ── 2. Ab referral code check karo ────────────────────── */
  const referrer = await User.findOne({ referralCode: clean });
  if (!referrer) return { ok: false, message: "This code is not valid" };

  // Apne hi code se discount nahi
  if (buyerEmail && referrer.email === buyerEmail) {
    return { ok: false, message: "You cannot use your own referral code 🙂" };
  }

  // Ek user zindagi mein ek hi baar referral discount le sakta hai
  if (buyerEmail) {
    const existing = await User.findOne({ email: buyerEmail });
    if (existing?.referredBy) {
      return { ok: false, message: "You have already used a referral code" };
    }
  }

  const discount = Math.max(
    0,
    Math.min(Math.round((base * WELCOME_PERCENT) / 100), base - 1)
  );

  if (discount <= 0) {
    return { ok: false, message: "This discount does not apply to this amount" };
  }

  return {
    ok:         true,
    discount,
    couponCode: clean,
    kind:       "referral",
    referrerId: referrer._id,
    message: `${WELCOME_PERCENT}% off — ${referrer.name?.split(" ")[0] || "your friend"}’s referral saved you ₹${discount}! 🎉`,
  };
};

/**
 * Payment successful hone ke baad call hota hai.
 *
 * Referrer ka ek hi reward coupon hota hai jo har referral pe 2% badhta
 * jaata hai (max 20%). Jab wo coupon use ho jaata hai, agla referral
 * naya coupon 2% se shuru karta hai.
 *
 * Ye kabhi throw nahi karta — payment flow isse rukna nahi chahiye.
 */
const creditReferral = async ({ referrerId, refereeEmail, refereeName }) => {
  try {
    if (!referrerId) return;

    // Atomic increment — do simultaneous payments count miss na karein
    const referrer = await User.findByIdAndUpdate(
      referrerId,
      { $inc: { referralCount: 1 } },
      { new: true }
    );
    if (!referrer) return;

    // Abhi jo coupon chal raha hai (bana hua, expire nahi, use nahi hua)
    const active = await Coupon.findOne({
      owner:  referrer._id,
      kind:   "referral_reward",
      active: true,
      $expr:  { $lt: ["$usedCount", "$maxUses"] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).sort({ createdAt: -1 });

    const expiresAt = new Date(Date.now() + REWARD_VALID_DAYS * 24 * 60 * 60 * 1000);
    let code, percent;

    if (active) {
      // Pehle se coupon hai → 2% aur badha do (cap tak)
      percent = Math.min(active.value + REWARD_PER_REFERRAL, REWARD_MAX_PERCENT);
      code    = active.code;

      if (percent !== active.value) {
        active.value     = percent;
        active.expiresAt = expiresAt; // har referral pe validity refresh
        active.note      = `Auto-reward: ${percent / REWARD_PER_REFERRAL} referrals`;
        await active.save();
      } else {
        console.log(`🎁 ${referrer.email} cap (${REWARD_MAX_PERCENT}%) par pahunch chuka hai`);
        return; // cap par hai — email bhi nahi bhejna
      }
    } else {
      // Koi active coupon nahi → naya 2% se shuru
      percent = REWARD_PER_REFERRAL;
      code    = `VR${randomChunk(7)}`;

      await Coupon.create({
        code,
        kind:         "referral_reward",
        discountType: "percent",
        value:        percent,
        owner:        referrer._id,
        ownerEmail:   referrer.email,
        maxUses:      1,
        expiresAt,
        note:         "Auto-reward: 1 referral",
      });

      await User.updateOne({ _id: referrer._id }, { $inc: { referralRewardsIssued: 1 } });
    }

    console.log(
      `🎁 Referral credited: ${referrer.email} → ${referrer.referralCount} total, coupon ${code} ab ${percent}%`
    );

    sendEmail({
      to:      referrer.email,
      subject: `🎁 Your discount is now ${percent}%`,
      html: referralRewardEmail({
        name:    referrer.name,
        code,
        percent,
        total:   referrer.referralCount,
        maxed:   percent >= REWARD_MAX_PERCENT,
      }),
    }).catch((e) => console.error("❌ Referral reward email failed:", e.message));
  } catch (err) {
    console.error("❌ creditReferral error:", err.message);
  }
};

/* Reward mila / badha — email */
const referralRewardEmail = ({ name, code, percent, total, maxed }) => `
<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;margin:0;padding:0}
  .container{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
  .header{background:linear-gradient(135deg,#16a34a,#15803d);padding:32px;text-align:center}
  .header h1{color:#fff;margin:0;font-size:23px}
  .body{padding:32px;color:#555;line-height:1.7;font-size:14px}
  .code-box{background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:24px;text-align:center;margin:24px 0}
  .code{font-size:30px;font-weight:bold;letter-spacing:5px;color:#16a34a;font-family:'Courier New',monospace}
  .footer{background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;color:#888;font-size:12px}
  .footer a{color:#dc2626;text-decoration:none}
</style></head>
<body>
  <div class="container">
    <div class="header"><h1>🎁 Your discount is now ${percent}%</h1></div>
    <div class="body">
      <p><strong>Hello ${name || "Runner"},</strong></p>
      <p><strong>${total} ${total === 1 ? "person has" : "people have"}</strong> joined Valley Run with your
      referral code. Your coupon is now worth <strong>${percent}% off</strong>:</p>
      <div class="code-box">
        <div class="code">${code}</div>
      </div>
      <p>${
        maxed
          ? "This is the maximum discount — it will not grow any further. Apply it at checkout on your next registration!"
          : "Every new referral adds another 2%. The more you refer, the more you save — hold on to it and let it grow! 🏃"
      }</p>
      <p><strong>Team Valley Run</strong></p>
    </div>
    <div class="footer">
      <p><strong>Valley Run Official</strong> · <a href="https://valleyrun.in">valleyrun.in</a></p>
    </div>
  </div>
</body></html>
`;

/** Coupon use ho gaya — usedCount badhao. */
const markCouponUsed = async ({ couponCode, userId, email, orderId, discount }) => {
  try {
    if (!couponCode) return;
    await Coupon.updateOne(
      { code: String(couponCode).toUpperCase() },
      {
        $inc:  { usedCount: 1 },
        $push: { usedBy: { user: userId, email, orderId, discount, at: new Date() } },
      }
    );
  } catch (err) {
    console.error("❌ markCouponUsed error:", err.message);
  }
};

/**
 * Razorpay notes mein max 15 key-value pairs allowed hain aur hum
 * pehle se 12 use kar rahe hain. Isliye coupon ki teeno cheezein
 * ek hi string mein pack karte hain: "CODE|discount|referrerId".
 */
const encodePromo = ({ couponCode = "", discount = 0, referrerId = "" }) =>
  couponCode ? `${couponCode}|${discount}|${referrerId || ""}` : "";

const decodePromo = (raw) => {
  if (!raw) return { couponCode: "", discountAmount: 0, referrerId: null };

  const [couponCode = "", discount = "0", referrerId = ""] = String(raw).split("|");
  return {
    couponCode,
    discountAmount: Number(discount) || 0,
    referrerId:     referrerId || null,
  };
};

module.exports = {
  ensureReferralCode,
  resolveDiscount,
  creditReferral,
  markCouponUsed,
  encodePromo,
  decodePromo,
  WELCOME_PERCENT,
  REWARD_PER_REFERRAL,
  REWARD_MAX_PERCENT,
};

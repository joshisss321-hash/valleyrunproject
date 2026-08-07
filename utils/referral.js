const crypto  = require("crypto");
const User    = require("../models/User");
const Coupon  = require("../models/Coupon");
const sendEmail = require("./sendEmail");

/* ── RULES (ek jagah, taaki badalna aasan rahe) ────────────── */
const WELCOME_PERCENT      = 5;  // friend ko turant
const REWARD_PERCENT       = 6;  // referrer ko
const REFERRALS_PER_REWARD = 3;  // itne paid referrals pe ek reward
const REWARD_VALID_DAYS    = 180;

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
  if (!clean) return { ok: false, message: "Code daaliye" };

  const base       = Number(amount) || 0;
  const buyerEmail = String(email || "").toLowerCase().trim();

  /* ── 1. Pehle normal coupon dhundo ─────────────────────── */
  const coupon = await Coupon.findOne({ code: clean });

  if (coupon) {
    const usable = coupon.checkUsable({ email: buyerEmail, amount: base, eventSlug });
    if (!usable.ok) return { ok: false, message: usable.message };

    const discount = coupon.calcDiscount(base);
    if (discount <= 0) {
      return { ok: false, message: "Is amount pe discount lagu nahi hota" };
    }

    return {
      ok:         true,
      discount,
      couponCode: coupon.code,
      kind:       coupon.kind,
      coupon,
      message:
        coupon.discountType === "percent"
          ? `${coupon.value}% off applied — ₹${discount} bachaye!`
          : `₹${discount} off applied!`,
    };
  }

  /* ── 2. Ab referral code check karo ────────────────────── */
  const referrer = await User.findOne({ referralCode: clean });
  if (!referrer) return { ok: false, message: "Ye code valid nahi hai" };

  // Apne hi code se discount nahi
  if (buyerEmail && referrer.email === buyerEmail) {
    return { ok: false, message: "Apna hi referral code use nahi kar sakte 🙂" };
  }

  // Ek user zindagi mein ek hi baar referral discount le sakta hai
  if (buyerEmail) {
    const existing = await User.findOne({ email: buyerEmail });
    if (existing?.referredBy) {
      return { ok: false, message: "Aap pehle hi ek referral code use kar chuke hain" };
    }
  }

  const discount = Math.max(
    0,
    Math.min(Math.round((base * WELCOME_PERCENT) / 100), base - 1)
  );

  if (discount <= 0) {
    return { ok: false, message: "Is amount pe discount lagu nahi hota" };
  }

  return {
    ok:         true,
    discount,
    couponCode: clean,
    kind:       "referral",
    referrerId: referrer._id,
    message: `${WELCOME_PERCENT}% off — ${referrer.name?.split(" ")[0] || "aapke friend"} ke referral se ₹${discount} bache! 🎉`,
  };
};

/**
 * Payment successful hone ke baad call hota hai.
 * Referrer ka count badhata hai aur har 3 referrals pe 6% ka coupon deta hai.
 * Ye kabhi throw nahi karta — registration payment flow isse rukna nahi chahiye.
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

    const earned    = Math.floor(referrer.referralCount / REFERRALS_PER_REWARD);
    const pending   = earned - (referrer.referralRewardsIssued || 0);

    console.log(
      `🎁 Referral credited: ${referrer.email} → ${referrer.referralCount} total, ${pending} reward(s) due`
    );

    for (let i = 0; i < pending; i++) {
      const rewardCode = `VR${randomChunk(7)}`;

      await Coupon.create({
        code:         rewardCode,
        kind:         "referral_reward",
        discountType: "percent",
        value:        REWARD_PERCENT,
        owner:        referrer._id,
        ownerEmail:   referrer.email,
        maxUses:      1,
        expiresAt:    new Date(Date.now() + REWARD_VALID_DAYS * 24 * 60 * 60 * 1000),
        note:         `Auto-reward: ${REFERRALS_PER_REWARD} successful referrals`,
      });

      await User.updateOne(
        { _id: referrer._id },
        { $inc: { referralRewardsIssued: 1 } }
      );

      sendEmail({
        to:      referrer.email,
        subject: `🎁 Aapne ${REWARD_PERCENT}% discount unlock kar liya!`,
        html: referralRewardEmail({
          name: referrer.name,
          code: rewardCode,
          percent: REWARD_PERCENT,
          total: referrer.referralCount,
        }),
      }).catch((e) => console.error("❌ Referral reward email failed:", e.message));
    }
  } catch (err) {
    console.error("❌ creditReferral error:", err.message);
  }
};

/* Reward mila — email */
const referralRewardEmail = ({ name, code, percent, total }) => `
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
    <div class="header"><h1>🎁 ${percent}% Discount Unlocked!</h1></div>
    <div class="body">
      <p><strong>Hello ${name || "Runner"},</strong></p>
      <p>Aapke referral code se ab tak <strong>${total} log</strong> Valley Run join kar chuke hain.
      Iske liye ye raha aapka <strong>${percent}% discount coupon</strong>:</p>
      <div class="code-box">
        <div class="code">${code}</div>
      </div>
      <p>Ise apni agli registration ke checkout pe apply kijiye. Aur log refer karte rahiye —
      har 3 referrals pe naya coupon milta rahega! 🏃</p>
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
  REWARD_PERCENT,
  REFERRALS_PER_REWARD,
};

const Registration = require("../models/Registration");
const { generateBib } = require("./bib");
const { markCouponUsed, creditReferral } = require("./referral");

/**
 * Payment ke baad registration banata hai — BIB, coupon usage aur
 * referral credit sab ek jagah.
 *
 * verify-payment aur webhook DONO isko call karte hain. Agar dono
 * ek saath chalein to `{user, event}` ka unique index duplicate rok
 * deta hai, aur side-effects (coupon/referral) sirf ek baar chalte hain.
 */
const completeRegistration = async ({
  user,
  event,
  paymentId,
  orderId       = "",
  category      = "General",
  amountPaid    = 0,
  couponCode    = "",
  discountAmount = 0,
  referrerId    = null,
}) => {
  // Pehle se hai? Kuch mat karo.
  const existing = await Registration.findOne({ user: user._id, event: event._id });
  if (existing) {
    console.log("⚠️ Already registered:", user.email, event.slug);
    return { registration: existing, created: false };
  }

  const bibNumber = await generateBib(event.slug);

  let registration;
  try {
    registration = await Registration.create({
      user:        user._id,
      event:       event._id,
      eventSlug:   event.slug,
      category,
      paymentId,
      orderId,
      amount:      amountPaid,
      status:      "paid",
      medalStatus: "pending",
      bibNumber,
      couponCode,
      discountAmount,
      statusHistory: [{ status: "pending", note: "Registration confirmed", at: new Date() }],
    });
  } catch (err) {
    // E11000 = doosra path (webhook/verify) ne milliseconds pehle bana diya
    if (err.code === 11000) {
      const race = await Registration.findOne({ user: user._id, event: event._id });
      console.log("⚠️ Race avoided, registration already exists:", user.email);
      return { registration: race, created: false };
    }
    throw err;
  }

  console.log(`✅ Registration saved: ${user.email} | ${event.slug} | ${bibNumber}`);

  // ── Side-effects: sirf pehli baar, aur inme se koi fail ho to
  //    registration par asar nahi padta (dono khud errors nigalte hain)
  if (couponCode) {
    await markCouponUsed({
      couponCode,
      userId:   user._id,
      email:    user.email,
      orderId,
      discount: discountAmount,
    });
  }

  if (referrerId) {
    // Is user ko permanently mark karo — ek hi baar referral discount milta hai
    if (!user.referredBy) {
      try {
        user.referredBy     = referrerId;
        user.referredByCode = couponCode;
        await user.save();
      } catch (err) {
        console.error("❌ referredBy set nahi hua:", err.message);
      }
    }

    await creditReferral({
      referrerId,
      refereeEmail: user.email,
      refereeName:  user.name,
    });
  }

  return { registration, created: true };
};

module.exports = { completeRegistration };

const Registration = require("../models/Registration");
const { generateBib } = require("./bib");
const { markCouponUsed, creditReferral } = require("./referral");

/* ── Marketing attribution ──────────────────────────────────────
   Order banate waqt tay ho chuki thi aur OrderAttribution mein
   orderId ke saath rakhi thi. Yahan bas uthani hai.

   ⚠️ Ye kabhi throw nahi karti. Attribution ek hisaab-kitaab ki
   cheez hai; kisi ka paisa kat chuka hai aur uski registration
   isliye nahi ruk sakti ki hum ginn nahi paaye. Na mile to
   registration bina attribution ke banti hai — bilkul waise jaise
   is feature se pehle banti thi.                                   */
const pickAttribution = async (orderId, eventId) => {
  if (!orderId) return null;
  try {
    const OrderAttribution = require("../models/OrderAttribution");
    const row = await OrderAttribution.findOne({ orderId }).lean();
    if (!row) return null;

    /* Event ka dobara milaan — order ke baad kuch badal gaya ho to
       bhi galat influencer ko credit na chale jaye. */
    const influencer =
      row.influencer && String(row.event || "") === String(eventId || "")
        ? row.influencer
        : null;

    return {
      influencer,
      code:     influencer ? row.code : "",
      source:   row.source   || "",
      medium:   row.medium   || "",
      campaign: row.campaign || "",
      content:  row.content  || "",
      term:     row.term     || "",
      firstTouchSource:   row.firstTouchSource   || "",
      firstTouchMedium:   row.firstTouchMedium   || "",
      firstTouchCampaign: row.firstTouchCampaign || "",
      lastTouchSource:    row.lastTouchSource    || "",
      lastTouchMedium:    row.lastTouchMedium    || "",
      lastTouchCampaign:  row.lastTouchCampaign  || "",
      paidAmount: Number(row.payable) || 0,
      at: new Date(),
    };
  } catch (err) {
    console.error("attribution uthane mein dikkat (registration par asar nahi):", err.message);
    return null;
  }
};

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

  // Order ke waqt tay hui attribution — na mile to null, aur sab
  // waise hi chalta hai jaise pehle chalta tha
  const attribution = await pickAttribution(orderId, event._id);

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
      ...(attribution ? { attribution } : {}),
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

  /* Streak challenge hai to enrollment bana do — window aaj hi tay ho
     jaana chahiye. Fail ho jaye to bhi registration surakshit hai: paisa
     kat chuka hai, aur enrollment baad mein ban sakti hai. */
  if (event.challengeType === "streak") {
    try {
      const { createStreakEnrollment } = require("./streakEnroll");
      await createStreakEnrollment({ user, event, registration, optionLabel: category });
    } catch (err) {
      console.error("❌ Streak enrollment nahi bani:", user.email, event.slug, err.message);
    }
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

/**
 * Early-bird daam ka hisaab — ek hi jagah.
 *
 * Admin do cheezein set karta hai:
 *   priceIncreaseAt — early bird kab tak (us din raat 11:59 PM IST tak)
 *   priceAfter      — uske baad ka daam
 *
 * Us waqt ke baad daam APNE AAP badh jaata hai. Sabse ahem: ye hisaab
 * SERVER par hota hai, isliye timer par jo dikhta hai wahi Razorpay bhi
 * charge karta hai — dono kabhi alag nahi ho sakte.
 *
 * Kuch set na ho to purana behaviour: daam wahi rehta hai.
 */

const priceState = (event) => {
  const base  = Number(event?.price)      || 0;
  const after = Number(event?.priceAfter) || 0;

  const at = event?.priceIncreaseAt ? new Date(event.priceIncreaseAt) : null;

  // Naya daam purane se zyada ho tabhi ye sab chalega — warna kuch nahi
  const planned = Boolean(at) && !isNaN(at?.getTime()) && after > base;
  const raised  = planned && Date.now() > at.getTime();

  return {
    price:           raised ? after : base,   // abhi jo lagega
    basePrice:       base,                    // early-bird daam
    priceAfter:      planned ? after : null,  // badhne ke baad ka daam
    priceIncreaseAt: planned ? at.toISOString() : null,
    priceRaised:     raised,                  // badh chuka hai?
  };
};

/** Abhi asli mein kitna lagega */
const effectivePrice = (event) => priceState(event).price;

/** Public API ke liye — `price` par seedha abhi wala daam chadha deta hai */
const withPricing = (event) => {
  const plain = event?.toObject ? event.toObject() : { ...event };
  return { ...plain, ...priceState(plain) };
};

module.exports = { priceState, effectivePrice, withPricing };

const User = require("../models/User");
const Registration = require("../models/Registration");
const { normalisePhone } = require("./tracking");

/**
 * Ek event mein ek email aur ek number se sirf ek hi registration.
 *
 * Ye rok pehle se thi, par GALAT JAGAH par: Registration par
 * {user, event} ka unique index hai, jo payment ke BAAD chalta hai.
 * Matlab banda dobara form bharta tha, paisa kat jaata tha, aur entry
 * banti hi nahi thi — refund admin ko manually karna padta tha.
 *
 * Ab order banne se pehle hi pata chal jaata hai.
 *
 * Lautata hai: null (saaf hai) ya { field: "email" | "phone" }.
 */
const findDuplicateRegistration = async ({ email, phone, eventId }) => {
  if (!eventId) return null;

  const hasRegistration = async (userIds) => {
    if (!userIds.length) return false;
    const reg = await Registration.findOne({
      user:  { $in: userIds },
      event: eventId,
    })
      .select("_id")
      .lean();
    return Boolean(reg);
  };

  /* ── Email ──
     User.email unique + lowercase hai, isliye seedha match kaafi hai. */
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (cleanEmail) {
    const user = await User.findOne({ email: cleanEmail }).select("_id").lean();
    if (user && (await hasRegistration([user._id]))) return { field: "email" };
  }

  /* ── Phone ──
     DB mein format ek jaisa nahi hai: "9876543210", "+91 9876543210",
     "98765 43210" — sab milte hain, aur phone par koi index bhi nahi.
     Aakhri 4 digit har format mein saath-saath hote hain, to pehle unse
     chhota candidate set nikalo, phir poore 10 digit JS mein milao.
     (tail sirf digits ka hai — regex injection ka raasta nahi.) */
  const cleanPhone = normalisePhone(phone);
  if (cleanPhone.length === 10) {
    const tail = cleanPhone.slice(-4);
    const candidates = await User.find({ phone: new RegExp(`${tail}$`) })
      .select("_id phone")
      .lean();

    const ids = candidates
      .filter((u) => normalisePhone(u.phone) === cleanPhone)
      .map((u) => u._id);

    if (await hasRegistration(ids)) return { field: "phone" };
  }

  return null;
};

/* Runner ko English mein saaf wajah — aur agla kadam kya hai. */
const duplicateMessage = (field, eventTitle) => {
  const where = eventTitle ? `for ${eventTitle}` : "for this event";
  return field === "phone"
    ? `This mobile number is already registered ${where}. Each mobile number can be used for one registration only — please use a different mobile number for this runner.`
    : `This email address is already registered ${where}. Each email address can be used for one registration only — please use a different email address for this runner.`;
};

module.exports = { findDuplicateRegistration, duplicateMessage };

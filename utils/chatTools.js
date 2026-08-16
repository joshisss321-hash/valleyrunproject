const Event         = require("../models/Event");
const Registration  = require("../models/Registration");
const RunSubmission = require("../models/RunSubmission");
const Coupon        = require("../models/Coupon");

const { submissionWindow } = require("./submissionWindow");
const { getNearestCategory, sortByTiming } = require("./categories");
const { REWARD_PER_REFERRAL, REWARD_MAX_PERCENT, WELCOME_PERCENT } = require("./referral");

/**
 * Chatbot ke tools.
 *
 * Sab READ-ONLY hain — bot kuch badal nahi sakta. Aur jo tools kisi
 * ke apne data ko chhute hain wo `user` ke bina chalte hi nahi, isliye
 * ek banda dusre ka data kabhi nahi dekh sakta.
 */

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

/* ═══════════════ Tool definitions (Claude ko dikhte hain) ═══════════════ */

const TOOL_DEFS = [
  {
    name: "get_open_events",
    description:
      "List the events currently open for registration, with price, dates and deadlines. " +
      "Call this whenever someone asks what events are running, how much it costs, " +
      "when registration closes, or which distances are available. Works without login.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_events",
    description:
      "Get the logged-in runner's own registrations: event name, BIB number, category, " +
      "their activity submission status, and whether they can submit right now. " +
      "Call this for anything about 'my registration', 'my events', 'can I submit yet', " +
      "or 'was my activity approved'. Requires the runner to be logged in.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_medal_tracking",
    description:
      "Get the logged-in runner's medal status for each of their events: dispatched or not, " +
      "tracking ID, courier, and dates. Call this for 'where is my medal', 'tracking id', " +
      "'kab aayega', or any delivery question. Requires the runner to be logged in.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_rank",
    description:
      "Get the logged-in runner's leaderboard position for events where their activity was " +
      "approved — rank, total runners in that category, and their timing. " +
      "Call this for 'my rank', 'leaderboard', 'kaun se number par hoon'. Requires login.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_active_coupons",
    description:
      "Get the discount coupons that are genuinely active in the Valley Run system right now. " +
      "ALWAYS call this before answering anything about coupons, promo codes, discounts or offers. " +
      "Never state or guess a coupon code without calling this first. If it returns none, tell the " +
      "runner there is no active coupon rather than inventing one. Works without login.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_my_payment_and_address",
    description:
      "Get the logged-in runner's payment record and the delivery address saved at registration — " +
      "amount paid, payment ID, and the full shipping address. Call this for 'did my payment go through', " +
      "'payment fail ho gaya', 'paisa kat gaya', 'my address is wrong', or 'where will my medal be " +
      "delivered'. Requires login.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_referral_status",
    description:
      "Get the logged-in runner's referral code, how many people have joined using it, " +
      "and the discount their coupon is currently worth. Call this for anything about " +
      "referrals, referral code, or 'kitna discount milega'. Requires login.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/* ═══════════════ Implementations ═══════════════ */

const NEEDS_LOGIN = {
  error: "not_logged_in",
  message:
    "This runner is not logged in, so their personal details are unavailable. " +
    "Tell them to log in at valleyrun.in/login with their registered email.",
};

const impl = {
  async get_open_events() {
    const events = await Event.find({ active: true, isPrevious: { $ne: true } })
      .select("title slug price dates registrationDeadline submissionDeadline isRegistrationOpen categories")
      .lean();

    if (!events.length) return { events: [], note: "No events are open for registration right now." };

    return {
      events: events.map((e) => {
        const w = submissionWindow(e);
        return {
          title:                e.title,
          price:                e.price ? `₹${e.price}` : "not set",
          dates:                e.dates || null,
          registration_closes:  fmtDate(e.registrationDeadline),
          registration_open:    e.isRegistrationOpen !== false,
          submission_open_now:  w.open,
          submission_note:      w.open ? "Activity can be submitted now" : w.reason,
          categories:           e.categories?.length ? e.categories : null,
          link:                 `https://valleyrun.in/challenges/${e.slug}`,
        };
      }),
    };
  },

  async get_my_events(user) {
    if (!user) return NEEDS_LOGIN;

    const regs = await Registration.find({ user: user._id })
      .populate("event", "title slug registrationDeadline submissionDeadline isRegistrationOpen isPrevious")
      .sort({ createdAt: -1 })
      .lean();

    if (!regs.length) {
      return { registrations: [], note: "This runner has no registrations yet." };
    }

    const subs = await RunSubmission.find({ email: user.email }).lean();
    const bySlug = {};
    subs.forEach((s) => { bySlug[s.eventSlug] = s; });

    return {
      runner: user.name,
      registrations: regs.map((r) => {
        const slug = r.eventSlug || r.event?.slug;
        const sub  = bySlug[slug];
        const w    = submissionWindow(r.event);

        return {
          event:      r.event?.title || slug,
          bib:        r.bibNumber || "not assigned",
          category:   r.category,
          registered: fmtDate(r.createdAt),
          activity: sub
            ? { status: sub.status, distance: sub.distance, timing: sub.timing || "no timing given" }
            : "not submitted yet",
          can_submit_now: w.open && !sub,
          submit_note: sub
            ? "Already submitted — only one submission per event"
            : w.open
              ? "Can submit now, from the profile (My Events) or the Activity Submission page"
              : w.reason,
        };
      }),
    };
  },

  async get_medal_tracking(user) {
    if (!user) return NEEDS_LOGIN;

    const regs = await Registration.find({ user: user._id })
      .populate("event", "title slug")
      .sort({ createdAt: -1 })
      .lean();

    if (!regs.length) return { medals: [], note: "No registrations, so no medals yet." };

    return {
      medals: regs.map((r) => ({
        event:        r.event?.title || r.eventSlug,
        status:       r.medalStatus || "pending",
        tracking_id:  r.trackingId || null,
        courier:      r.courier || null,
        tracking_url: r.trackingUrl || null,
        dispatched:   fmtDate(r.dispatchedAt),
        delivered:    fmtDate(r.deliveredAt),
        note: {
          pending:    "Medal ships once the activity is verified",
          verified:   "Activity verified — medal will be dispatched soon",
          dispatched: "On its way. Usually 7-10 days from dispatch",
          delivered:  "Delivered",
        }[r.medalStatus || "pending"],
      })),
    };
  },

  async get_my_rank(user) {
    if (!user) return NEEDS_LOGIN;

    const mine = await RunSubmission.find({ email: user.email, status: "approved" }).lean();
    if (!mine.length) {
      return { ranks: [], note: "No approved activities yet, so no leaderboard position." };
    }

    const slugs = [...new Set(mine.map((s) => s.eventSlug))];
    const peers = await RunSubmission.find({ eventSlug: { $in: slugs }, status: "approved" })
      .select("eventSlug distance timingSeconds email")
      .lean();

    return {
      ranks: mine.map((s) => {
        const category = getNearestCategory(s.distance);
        const pool = peers
          .filter((p) => p.eventSlug === s.eventSlug && getNearestCategory(p.distance) === category)
          .sort(sortByTiming);

        const pos = pool.findIndex((p) => p.email === user.email);

        return {
          event:      s.eventSlug,
          category,
          timing:     s.timing || "no timing given",
          rank:       pos === -1 ? null : pos + 1,
          out_of:     pool.length,
          note: pos === -1
            ? "Not ranked — a timing is needed to appear on the leaderboard"
            : null,
        };
      }),
    };
  },

  async get_active_coupons() {
    const now = new Date();

    const coupons = await Coupon.find({
      kind:   "manual",          // referral rewards kisi ek bande ke hote hain — public nahi
      active: true,
      owner:  null,              // kisi ek user se bandhe hue nahi
      $expr:  { $lt: ["$usedCount", "$maxUses"] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).lean();

    if (!coupons.length) {
      return {
        active_coupons: [],
        note:
          "No public coupon is active right now. Tell the runner plainly that there is no " +
          "active coupon — do NOT invent one. Their referral code still gives a discount.",
      };
    }

    return {
      active_coupons: coupons.map((c) => ({
        code:      c.code,
        discount:  c.discountType === "percent" ? `${c.value}% off` : `₹${c.value} off`,
        event:     c.eventSlug || "all events",
        min_order: c.minAmount ? `₹${c.minAmount}` : null,
        expires:   fmtDate(c.expiresAt),
        uses_left: c.maxUses - c.usedCount,
      })),
    };
  },

  async get_my_payment_and_address(user) {
    if (!user) return NEEDS_LOGIN;

    const regs = await Registration.find({ user: user._id })
      .populate("event", "title")
      .sort({ createdAt: -1 })
      .lean();

    const address = [user.address1, user.address2, user.landmark, user.city, user.state, user.pincode]
      .filter(Boolean)
      .join(", ");

    return {
      delivery_address: address || "No address saved",
      phone:            user.phone || null,
      address_note:
        "This is where medals are couriered. If it is wrong and nothing has shipped yet, " +
        "the runner can update it from their profile. If it has already shipped, support must handle it.",
      payments: regs.map((r) => ({
        event:      r.event?.title || r.eventSlug,
        registration_id: r.bibNumber || "not assigned",
        amount_paid: r.amount ? `₹${r.amount}` : "not recorded",
        discount:    r.discountAmount ? `₹${r.discountAmount} (${r.couponCode})` : "none",
        payment_id:  r.paymentId || null,
        status:      r.status || "unknown",
        paid_on:     fmtDate(r.createdAt),
      })),
      note: regs.length
        ? "A registration exists, so the payment went through."
        : "No registration found for this runner — if money was deducted, this needs the support team.",
    };
  },

  async get_referral_status(user) {
    if (!user) return NEEDS_LOGIN;

    const coupon = await Coupon.findOne({
      owner:  user._id,
      kind:   "referral_reward",
      active: true,
      $expr:  { $lt: ["$usedCount", "$maxUses"] },
    }).sort({ createdAt: -1 }).lean();

    const current = coupon?.value || 0;

    return {
      referral_code:   user.referralCode || "will be created on first login",
      referral_link:   user.referralCode ? `https://valleyrun.in?ref=${user.referralCode}` : null,
      people_joined:   user.referralCount || 0,
      your_coupon:     coupon ? { code: coupon.code, discount: `${current}% off` } : "none yet",
      next_referral_gives: current >= REWARD_MAX_PERCENT
        ? `Already at the maximum ${REWARD_MAX_PERCENT}%`
        : `${Math.min(current + REWARD_PER_REFERRAL, REWARD_MAX_PERCENT)}% off`,
      rules: `Friend who uses your code gets ${WELCOME_PERCENT}% off. ` +
             `Your own coupon grows ${REWARD_PER_REFERRAL}% per referral, up to ${REWARD_MAX_PERCENT}%.`,
    };
  },
};

/** Claude ne jo tool maanga, use chalao. Kabhi throw nahi karta. */
const runTool = async (name, user) => {
  try {
    const fn = impl[name];
    if (!fn) return { error: "unknown_tool", message: `No tool named ${name}` };
    return await fn(user);
  } catch (err) {
    console.error(`❌ chat tool "${name}" fail:`, err.message);
    return { error: "tool_failed", message: "Could not fetch that right now." };
  }
};

module.exports = { TOOL_DEFS, runTool };

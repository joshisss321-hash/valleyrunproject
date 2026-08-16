const express = require("express");
const router  = express.Router();

const { optionalUser } = require("../middleware/userAuth");
const { SYSTEM_PROMPT, SUPPORT_PHONE, SUPPORT_EMAIL, WHATSAPP_CHANNEL } = require("../utils/chatKnowledge");
const { TOOL_DEFS, runTool } = require("../utils/chatTools");

/* Opus 5 default. Sasta chahiye to .env mein CHAT_MODEL=claude-haiku-4-5 */
const MODEL          = process.env.CHAT_MODEL || "claude-opus-5";
const MAX_HISTORY    = 12;   // itne se purane messages kaat dete hain (kharcha kaabu mein)
const MAX_TOOL_LOOPS = 5;    // tool → jawab → tool ... itni baar se zyada nahi
const MAX_PER_HOUR   = 30;   // ek bande ke itne message per ghanta

/* ── Rate limit (memory mein — deploy par reset ho jaata hai, theek hai) ── */
const hits = new Map();

const rateLimited = (key) => {
  const now    = Date.now();
  const hourMs = 60 * 60 * 1000;
  const list   = (hits.get(key) || []).filter((t) => now - t < hourMs);

  if (list.length >= MAX_PER_HOUR) {
    hits.set(key, list);
    return true;
  }

  list.push(now);
  hits.set(key, list);

  // Map ko badhne se roko
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > hourMs) hits.delete(k);
    }
  }
  return false;
};

/* ── Anthropic client — package ya key na ho to null ── */
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const mod = require("@anthropic-ai/sdk");
    const Anthropic = typeof mod === "function" ? mod : (mod.Anthropic || mod.default);
    return typeof Anthropic === "function" ? new Anthropic() : null;
  } catch {
    return null;
  }
};

/* ── AI band ho (key nahi / error) to bhi kaam ka jawab ──
   Ye chhota keyword-matcher hai, na ki ek hi ratta-ratayi line.
   Sabse zyada poochhe jaane wale sawaalon ke jawab yahin se aa jaate hain. */
const CONTACT = `\n\n📞 ${SUPPORT_PHONE}\n✉️ ${SUPPORT_EMAIL}`;

const CANNED = [
  {
    // Sirf abhivadan — "can't answer" kehna galat hoga
    match: /^\s*(hi|hey|hello|hlo|namaste|namaskar|hii+|yo|good (morning|evening|afternoon))\b[\s!.?]*$/i,
    reply:
      `Hello! I can help you with:\n\n` +
      `• How and when to submit your activity\n` +
      `• Medal dispatch and tracking\n` +
      `• Login and profile\n` +
      `• Referrals and discounts\n` +
      `• Leaderboard and rankings\n\n` +
      `Just type your question.`,
  },
  {
    match: /submit|submission|screenshot|proof|upload|activity|kaha daal|kaise daal/i,
    reply:
      `Activity submission opens only after registration for your event closes. ` +
      `Before that the submit option does not appear anywhere — that is normal.\n\n` +
      `Once registration closes:\n` +
      `1. Log in at valleyrun.in/login\n` +
      `2. Open "My Events" — the Submit Activity button is on your event card\n` +
      `3. Add your distance, timing and screenshot, then submit\n\n` +
      `You can also use the Activity Submission page on the website and find your ` +
      `registration with your registered phone number or email. Any GPS app works ` +
      `(Strava, Nike Run Club, Garmin, Google Fit) — the screenshot should clearly ` +
      `show the app name and the distance.`,
  },
  {
    match: /medal|tracking|delivery|courier|kab aayega|kb ayega|shipping|parcel|dispatch/i,
    reply:
      `Your medal is dispatched after your activity is approved. Delivery usually takes ` +
      `7-10 days from dispatch.\n\n` +
      `The tracking ID and courier appear in your profile under "Medal Tracking" — ` +
      `log in at valleyrun.in/login to see yours.`,
  },
  {
    match: /otp|login|log in|sign in|code nahi|password|profile kaha/i,
    reply:
      `No password needed. Go to valleyrun.in/login, enter your registered email, and a ` +
      `6-digit code arrives by email. It stays valid for 10 minutes.\n\n` +
      `If the code does not arrive: check your spam folder, leave 60 seconds between ` +
      `requests, and make sure it is the same email you used at registration.`,
  },
  {
    match: /payment|paisa kat|paise kat|razorpay|upi|card|net banking|fail ho gaya|deduct/i,
    reply:
      `Payments are processed securely through Razorpay — UPI, cards and net banking all work.\n\n` +
      `If money was deducted but your registration did not confirm, log in and check your ` +
      `profile. If the registration is there, the payment went through. If it is not, send ` +
      `the team your name, registered mobile or email, and the payment reference.${CONTACT}\n\n` +
      `Valley Run will never ask you for an OTP, PIN or card details.`,
  },
  {
    match: /address|pincode|pin code|wrong address|delivery address|pata/i,
    reply:
      `Your medal ships to the address you entered at registration.\n\n` +
      `If it has not been dispatched yet, you can update the address from your profile. ` +
      `If it has already shipped, please contact the team — changing it at that stage ` +
      `is not always possible.${CONTACT}`,
  },
  {
    match: /fake|real hai|genuine|legit|scam|trust|dhokha/i,
    reply:
      `Valley Run is a virtual fitness challenge platform. You complete your distance ` +
      `anywhere you like, submit a GPS screenshot as proof, and once it is verified your ` +
      `physical medal is couriered to your home.\n\n` +
      `Payments are handled securely through Razorpay. You can see participant reviews and ` +
      `medal photos on valleyrun.in`,
  },
  {
    match: /refund|cancel|paisa wapas|money back/i,
    reply:
      `Registration fees are generally non-refundable. A refund is issued only if Valley Run ` +
      `cancels an event.\n\n` +
      `If you need to raise a refund request, please email the team within 7 days of ` +
      `registration with your details.${CONTACT}`,
  },
  {
    match: /referral|refer|discount|coupon|promo|offer/i,
    reply:
      `Every runner gets a referral code in their profile under "Refer & Earn".\n\n` +
      `Anyone who registers with your code gets a discount, and your own coupon grows with ` +
      `each successful referral. Log in to see your code and your current discount.`,
  },
  {
    match: /leaderboard|rank|position|timing|naam nahi/i,
    reply:
      `Only approved activities appear on the leaderboard, ranked by timing within each ` +
      `distance category — fastest first.\n\n` +
      `If you did not enter a timing, your activity still counts as completed but cannot be ranked.`,
  },
  {
    match: /certificate/i,
    reply:
      `A digital certificate is part of the package. There is no download option on the site ` +
      `yet — the team sends it out.${CONTACT}`,
  },
  {
    match: /event|price|kitne ka|cost|register|join|kaise/i,
    reply:
      `Current events, prices and closing dates are listed on the Challenges page at valleyrun.in\n\n` +
      `Registering is quick: pick your event, fill the form (check the address carefully — ` +
      `that is where your medal goes), and pay through Razorpay.`,
  },
];

const FALLBACK_DEFAULT =
  `I don't have that information right now, but the team can help you straight away.${CONTACT}`;

const cannedReply = (text) => {
  const q = String(text || "");
  const hit = CANNED.find((c) => c.match.test(q));
  return hit ? hit.reply : FALLBACK_DEFAULT;
};

/* ═══════════════════════════════════════════════════════════
   POST /api/chat
   Body: { messages: [{ role: "user"|"assistant", content: "..." }] }

   Login optional — token ho to bot uske apne registration, medal
   aur rank tak pahunch sakta hai; na ho to aam jaankari deta hai.
═══════════════════════════════════════════════════════════ */
router.post("/", optionalUser, async (req, res) => {
  try {
    const incoming = Array.isArray(req.body.messages) ? req.body.messages : [];

    if (!incoming.length) {
      return res.status(400).json({ success: false, message: "No message sent" });
    }

    /* ── Rate limit ── */
    const key = req.user
      ? `u:${req.user._id}`
      : `ip:${req.headers["x-forwarded-for"] || req.ip || "unknown"}`;

    if (rateLimited(key)) {
      return res.status(429).json({
        success: false,
        reply: `You've sent a lot of messages in the last hour. Please try again later, ` +
               `or reach the team directly on ${SUPPORT_PHONE}.`,
      });
    }

    const lastUser = [...incoming].reverse().find((m) => m?.role === "user")?.content || "";

    const client = getClient();
    if (!client) {
      return res.json({ success: true, reply: cannedReply(lastUser), degraded: true });
    }

    /* ── History saaf karo: sirf role+content, aur aakhri kuch hi ── */
    const messages = incoming
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    if (!messages.length || messages[0].role !== "user") {
      return res.status(400).json({ success: false, message: "Conversation must start with a question" });
    }

    /* ── Claude ka tool loop ──
       Tool runner (beta) ki jagah manual loop — live site par beta
       dependency nahi lena chahta tha, aur loop chhota hi hai. */
    const context = req.user
      ? `\n\n# This runner\nLogged in as ${req.user.name} (${req.user.email}). ` +
        `Use the tools for their own details.`
      : `\n\n# This runner\nNot logged in. Answer generally; for personal details ` +
        `ask them to log in at valleyrun.in/login.`;

    let reply = "";

    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
      const response = await client.messages.create({
        model:      MODEL,
        max_tokens: 4000,          // thinking + jawab dono isi mein
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Har request mein wahi prompt jaata hai — cache kar do
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: context },
        ],
        tools:         TOOL_DEFS,
        output_config: { effort: "low" },   // support sawaal seedhe hote hain
        messages,
      });

      if (response.stop_reason === "refusal") {
        console.warn("⚠️ chat refusal:", response.stop_details?.category);
        reply = cannedReply(lastUser);
        break;
      }

      const toolUses = response.content.filter((b) => b.type === "tool_use");

      if (!toolUses.length) {
        reply = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        break;
      }

      // Tool chalao aur nateeje wapas bhejo
      messages.push({ role: "assistant", content: response.content });

      const results = [];
      for (const t of toolUses) {
        const data = await runTool(t.name, req.user);
        results.push({
          type:        "tool_result",
          tool_use_id: t.id,
          content:     JSON.stringify(data),
        });
      }
      messages.push({ role: "user", content: results });
    }

    res.json({ success: true, reply: reply || cannedReply(lastUser) });
  } catch (err) {
    console.error("chat error:", err.message);
    const lastUser = (req.body?.messages || []).filter((m) => m?.role === "user").pop()?.content || "";
    res.json({ success: true, reply: cannedReply(lastUser), degraded: true });
  }
});

module.exports = router;

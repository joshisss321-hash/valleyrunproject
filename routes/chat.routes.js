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
    // Sirf abhivadan — "jawab nahi de pa raha" kehna galat hoga
    match: /^\s*(hi|hey|hello|hlo|namaste|namaskar|hii+|yo|good (morning|evening|afternoon))\b[\s!.?]*$/i,
    reply:
      `Namaste! 👋 Main in sab mein madad kar sakta hoon:\n\n` +
      `• Activity kaise aur kab submit karni hai\n` +
      `• Medal kahan pahuncha — tracking\n` +
      `• Login / OTP ki dikkat\n` +
      `• Referral aur discount\n` +
      `• Leaderboard aur rank\n\n` +
      `Bas apna sawaal likh dijiye.`,
  },
  {
    match: /submit|submission|screenshot|proof|upload|activity/i,
    reply:
      `Activity submission tabhi khulta hai jab us event ki registration band ho jaye.\n\n` +
      `Uske baad teen tarike hain:\n` +
      `• Profile — valleyrun.in/login par login karke "My Events" mein Submit button\n` +
      `• Website ka Activity Submission page — apna registered phone ya email daal kar\n` +
      `• WhatsApp channel — ${WHATSAPP_CHANNEL}\n\n` +
      `Screenshot kisi bhi GPS app ka chalega (Strava, Nike Run Club, Garmin, Google Fit) — ` +
      `usme app ka naam aur distance saaf dikhna chahiye.`,
  },
  {
    match: /medal|tracking|delivery|courier|kab aayega|shipping|parcel/i,
    reply:
      `Medal activity approve hone ke baad dispatch hota hai. Dispatch ke baad aam taur par 5-10 din lagte hain.\n\n` +
      `Tracking ID aur courier aapki profile mein "Medal Tracking" tab mein dikhte hain — ` +
      `valleyrun.in/login se login kijiye.`,
  },
  {
    match: /otp|login|log in|sign in|code nahi|password/i,
    reply:
      `Login ke liye password nahi chahiye. valleyrun.in/login par apni registered email daaliye, ` +
      `6-digit code email par aa jayega (10 minute valid).\n\n` +
      `Code na aaye to: spam folder dekhiye, do requests ke beech 60 second ka gap rakhiye, ` +
      `aur dhyan rakhiye ki wahi email ho jo registration mein di thi.`,
  },
  {
    match: /refund|cancel|paisa wapas|money back/i,
    reply:
      `Registration fee aam taur par non-refundable hai. Refund sirf tab milta hai jab Valley Run khud ` +
      `event cancel kare.\n\nKoi refund request ho to registration ke 7 din ke andar email kijiye — ` +
      `team dekhegi.${CONTACT}`,
  },
  {
    match: /referral|refer|discount|coupon|code/i,
    reply:
      `Har runner ko apni profile mein "Refer & Earn" tab mein referral code milta hai.\n\n` +
      `Aapke code se koi register kare to use 2% off milta hai, aur aapka apna coupon har referral pe ` +
      `2% badhta hai — zyada se zyada 20% tak (5 referrals = 10%, 10 referrals = 20%).`,
  },
  {
    match: /leaderboard|rank|position|timing/i,
    reply:
      `Leaderboard par sirf approved activities aati hain, har distance category mein timing ke hisaab se ` +
      `— sabse tez sabse upar.\n\nTiming diye bina activity complete to ginti hai par rank nahi milta.`,
  },
  {
    match: /certificate/i,
    reply:
      `Digital certificate package mein shaamil hai. Abhi site par download ka option nahi hai — ` +
      `team ise bhejti hai.${CONTACT}`,
  },
  {
    match: /event|price|kitne ka|registration|join|kaise/i,
    reply:
      `Chalu events, unki price aur last date valleyrun.in ke Challenges page par dikhti hai.\n\n` +
      `Registration seedha-sada hai: event chuniye, form bhariye (address dhyan se — medal wahi ` +
      `aayega), aur Razorpay se payment kijiye. Do minute ka kaam hai.`,
  },
];

const FALLBACK_DEFAULT =
  `Main abhi is sawaal ka jawab nahi de pa raha, par team turant madad kar degi.${CONTACT}`;

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

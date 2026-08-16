const express = require("express");
const router  = express.Router();

const { optionalUser } = require("../middleware/userAuth");
const { SYSTEM_PROMPT, SUPPORT_PHONE, SUPPORT_EMAIL } = require("../utils/chatKnowledge");
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

/* AI band ho to bhi user ko khaali haath na lautayein */
const FALLBACK =
  `I can't answer that right now, but the team can help you straight away.\n\n` +
  `📞 ${SUPPORT_PHONE}\n✉️ ${SUPPORT_EMAIL}\n\n` +
  `Quick answers: activity submission opens once registration for your event closes — ` +
  `you'll find the Submit button in your profile under "My Events", and on the ` +
  `Activity Submission page. Medal tracking also shows in your profile.`;

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

    const client = getClient();
    if (!client) {
      return res.json({ success: true, reply: FALLBACK, degraded: true });
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
        reply = FALLBACK;
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

    res.json({ success: true, reply: reply || FALLBACK });
  } catch (err) {
    console.error("chat error:", err.message);
    res.json({ success: true, reply: FALLBACK, degraded: true });
  }
});

module.exports = router;

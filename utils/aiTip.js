const crypto = require("crypto");

/**
 * AI coaching tip — Claude se ek personalised line.
 *
 * Ye poori tarah OPTIONAL hai. Agar ANTHROPIC_API_KEY set nahi hai
 * ya @anthropic-ai/sdk install nahi hai, to ye chupchap null return
 * karta hai aur profile sirf rule-based stats dikhati hai.
 *
 * Tip cache hoti hai — stats badalne par hi naya API call jaata hai.
 */

// Opus 5 default. Sasta chahiye to .env mein COACH_MODEL=claude-haiku-4-5
const MODEL = process.env.COACH_MODEL || "claude-opus-5";

/** Stats ka fingerprint — badalne par hi tip regenerate hoti hai. */
const statsSignature = (stats) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        completed: stats.completedEvents,
        km:        stats.totalKm,
        best:      stats.bestPaceSeconds,
        improved:  stats.improvement?.percent ?? null,
        model:     MODEL,
      })
    )
    .digest("hex")
    .slice(0, 32);

/** SDK lazy-load — package na ho to server crash na ho. */
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const mod = require("@anthropic-ai/sdk");
    // SDK version ke hisaab se export function bhi ho sakta hai ya wrapped bhi
    const Anthropic = typeof mod === "function" ? mod : (mod.Anthropic || mod.default);
    if (typeof Anthropic !== "function") return null;
    return new Anthropic();
  } catch {
    console.warn("⚠️  @anthropic-ai/sdk installed nahi hai — AI coach tip skip");
    return null;
  }
};

const buildPrompt = (stats, name) => {
  const pb = stats.personalBests
    .map((p) => `- ${p.distance}: ${p.timing} (${p.paceLabel})`)
    .join("\n") || "- abhi koi timed run nahi";

  const improvementLine = stats.improvement
    ? stats.improvement.improved
      ? `Pichle event se ${stats.improvement.percent}% tez hue (${stats.improvement.from.paceLabel} → ${stats.improvement.to.paceLabel}).`
      : `Pichle event se ${stats.improvement.percent}% dheeme rahe (${stats.improvement.from.paceLabel} → ${stats.improvement.to.paceLabel}).`
    : "Comparison ke liye abhi ek hi timed run hai.";

  return `Runner: ${name || "Runner"}

Events complete kiye: ${stats.completedEvents}
Total distance: ${stats.totalKm} km
Best pace: ${stats.bestPaceLabel}
${improvementLine}

Personal bests:
${pb}

Next target: ${stats.nextTarget ? `${stats.nextTarget.distance} ko ${stats.nextTarget.targetTiming} mein (abhi ${stats.nextTarget.currentTiming})` : "abhi set nahi"}`;
};

const SYSTEM = `Tum Valley Run ke coach ho — ek virtual running event platform jahan log kahin bhi daudte hain aur GPS screenshot submit karte hain.

Runner ke data ke aadhar par 2-3 sentence ka coaching tip likho.

Rules:
- Hinglish mein likho (Roman script, Hindi + English mix) — waise hi jaise doston se baat karte ho
- Data se ek specific baat uthao (unka pace, unka improvement, unka target) — generic advice mat do
- Ek concrete, actionable suggestion do jo agle 2 hafte mein try kar sakein
- Encouraging raho par jhoothi tareef mat karo. Agar wo dheeme hue hain to seedha kaho aur wajah/upay batao
- Sirf tip ka text do — koi heading, bullet, quotes ya preamble nahi
- Medical advice kabhi mat do. Dard ya injury ki baat aaye to doctor se milne ko kaho`;

/**
 * @returns {Promise<string|null>} tip text, ya null agar available nahi
 */
const generateCoachTip = async (stats, name) => {
  // Bina kisi complete run ke koi meaningful tip nahi banti
  if (!stats || stats.completedEvents === 0) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model:      MODEL,
      // max_tokens thinking + text dono ko cover karta hai — isliye
      // tip chhoti hone ke bawajood headroom rakha hai
      max_tokens: 2000,
      system:     SYSTEM,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: buildPrompt(stats, name) }],
    });

    if (response.stop_reason === "refusal") {
      console.warn("⚠️  Coach tip refused:", response.stop_details?.category);
      return null;
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    return text || null;
  } catch (err) {
    console.error("❌ Coach tip generate nahi hui:", err.message);
    return null;
  }
};

module.exports = { generateCoachTip, statsSignature, MODEL };

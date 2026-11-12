const crypto = require("crypto");

/* ═══════════════════════════════════════════════════════════════
   Marketing attribution ka dimaag.

   ⚠️ Ye file kabhi throw nahi karti. Iska har caller payment ke
   raaste par hai, aur attribution ki koi bhi gadbad kisi ki
   registration nahi rok sakti. Jahan pata na chale, wahan khali
   chhod do — galat jawab se behtar hai.
   ═══════════════════════════════════════════════════════════════ */

const SECRET = process.env.ATTRIBUTION_SECRET || "";
const TOKEN_DAYS = 30;

/** Secret na ho to poora feature chup-chaap band. Admin ko iski
 *  chetawni dikhti hai, taaki ye galti pakdi jaye, chhupe nahi. */
const isEnabled = () => SECRET.length >= 16;

/* ── 8 buckets, jaise spec mein ── */
const SOURCES = [
  "influencer",
  "instagram_ads",
  "facebook_ads",
  "whatsapp_group",
  "whatsapp_direct",
  "organic",
  "direct",
  "other",
];

const SOURCE_LABEL = {
  influencer:      "Influencer",
  instagram_ads:   "Instagram Ads",
  facebook_ads:    "Facebook Ads",
  whatsapp_group:  "WhatsApp Groups",
  whatsapp_direct: "WhatsApp Direct",
  organic:         "Organic Search",
  direct:          "Direct",
  other:           "Other / Unknown",
};

/* ── Token ───────────────────────────────────────────────────────
   base64url(payload) . base64url(hmac)

   Client ise sirf aage-peeche le jaata hai, padhta ya badalta nahi.
   Ek akshar badla to signature fail aur attribution gir jaati hai —
   isiliye koi apne aap ko kisi influencer ka laaya hua nahi bata
   sakta.                                                            */

const b64 = (buf) => Buffer.from(buf).toString("base64url");

const sign = (data) =>
  crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

const signToken = (payload) => {
  if (!isEnabled()) return "";
  try {
    const body = b64(
      JSON.stringify({ ...payload, exp: Date.now() + TOKEN_DAYS * 864e5 })
    );
    return body + "." + sign(body);
  } catch {
    return "";
  }
};

const verifyToken = (token) => {
  if (!isEnabled() || !token) return null;
  try {
    const [body, mac] = String(token).split(".");
    if (!body || !mac) return null;

    const expected = sign(body);
    // Lambai alag ho to timingSafeEqual khud throw karta hai
    if (mac.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;

    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data || !data.exp || Date.now() > data.exp) return null;   // 30 din poore
    return data;
  } catch {
    return null;
  }
};

/* ── Source pehchanna ────────────────────────────────────────────
   Tay shuda kram. Pata na chale to andaaza NAHI lagate — "direct"
   ya "other" likh dete hain. Jhootha source asli se zyada khatarnak
   hai, kyunki uspar paisa kharch hota hai.                          */

const SEARCH_ENGINES = /(google|bing|yahoo|duckduckgo|ecosia|baidu|yandex|brave|qwant)\./i;

const has = (hay, ...needles) => {
  const s = String(hay || "").toLowerCase();
  return needles.some((n) => s.includes(n));
};

const PAID = ["paid", "cpc", "ppc", "ads", "ad", "sponsored"];

const classify = ({ hasInfluencer, utm = {}, referrer = "" }) => {
  if (hasInfluencer) return "influencer";

  const src  = String(utm.source || "").toLowerCase();
  const med  = String(utm.medium || "").toLowerCase();
  const paid = PAID.some((p) => med.split(/[^a-z]+/).includes(p));

  if (src) {
    if (has(src, "instagram", "insta") && paid) return "instagram_ads";
    if ((has(src, "facebook", "meta") || src === "fb") && paid) return "facebook_ads";
    if (has(src, "whatsapp") || src === "wa") {
      return has(med, "group", "community") ? "whatsapp_group" : "whatsapp_direct";
    }
    // UTM to hai par kisi bucket mein nahi baithta — raw values bach
    // jaati hain, bucket "other"
    return "other";
  }

  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (SEARCH_ENGINES.test(host)) return "organic";
      // valleyrun.in se valleyrun.in — ye nayi visit nahi hai
      if (has(host, "valleyrun")) return "";
      return "other";
    } catch {
      return "other";
    }
  }

  return "direct";
};

/** Kya is visit mein sach mein koi signal hai?
 *  Khali "direct" visit kuch overwrite nahi karti — warna influencer
 *  ka link kholne ke baad homepage par aana hi uska credit chheen
 *  leta. */
const hasSignal = (source) => Boolean(source) && source !== "direct";

/* ── First-touch / last-touch ────────────────────────────────────
   First-touch ek baar likhta hai aur phir kabhi nahi badalta.
   Last-touch sirf tab badalta hai jab visit mein asli signal ho.    */

const mergeTouches = (prev, now) => {
  const out = { ...(prev || {}) };

  /* Bina kisi campaign ke aana bhi ek jaankari hai — "Direct". Use
     fenkna nahi chahiye, warna ye registration "pata nahi" wali
     dher mein chali jaati hai, jabki hum jaante hain ki wo seedha
     aaya tha.

     Par ye sirf PEHLI baar likhta hai. Baad ki koi bhi direct visit
     kuch nahi badalti — warna influencer ka link kholne ke baad
     homepage par aana hi uska credit chheen leta. */
  if (!hasSignal(now.source)) {
    if (now.source === "direct" && !out.firstTouchSource) {
      out.firstTouchSource   = "direct";
      out.firstTouchMedium   = "";
      out.firstTouchCampaign = "";
      out.firstTouchAt       = Date.now();
      out.source             = "direct";
      out.lastTouchSource    = "direct";
    }
    /* source === "" (apni hi site se aaya — andar ki navigation)
       ya koi aur soorat: kuch mat chhedo. */
    return out;
  }

  if (!out.firstTouchSource) {
    out.firstTouchSource   = now.source;
    out.firstTouchMedium   = now.medium   || "";
    out.firstTouchCampaign = now.campaign || "";
    out.firstTouchAt       = Date.now();
  }

  out.lastTouchSource   = now.source;
  out.lastTouchMedium   = now.medium   || "";
  out.lastTouchCampaign = now.campaign || "";

  /* Influencer ka credit PEHLE waale ko — jisne introduce kiya.
     Baad mein kisi aur ka link khula to wo lastInfluencerId mein
     dikhega, par credit nahi badlega. Dashboard dono dikhata hai. */
  if (now.influencerId) {
    if (!out.influencerId) {
      out.influencerId = now.influencerId;
      out.code         = now.code || "";
      out.eventIdsSnap = now.eventIdsSnap || [];
    }
    out.lastInfluencerId = now.influencerId;
  }

  // Current (= last) campaign ki poori detail
  out.source   = now.source;
  out.medium   = now.medium   || "";
  out.campaign = now.campaign || "";
  out.content  = now.content  || "";
  out.term     = now.term     || "";

  return out;
};

/* ── Visitor ki pehchaan ─────────────────────────────────────────
   IP + browser ka ek-tarfa hash. Kahin bhi asli IP save nahi hota
   aur is hash se IP wapas nikalna mumkin nahi.

   ⚠️ Ye ek ANDAAZA hai. Ek hi Wi-Fi ke do log ek ginne ja sakte
   hain; mobile ka IP badla to ek banda do ginn sakta hai. Dashboard
   par ye saaf likha hai.                                            */
const visitorHash = (ip, ua) => {
  if (!isEnabled()) return "";
  return crypto
    .createHmac("sha256", SECRET)
    .update((ip || "") + "|" + (ua || ""))
    .digest("hex")
    .slice(0, 32);
};

/* ── Bot chhantna ────────────────────────────────────────────────
   Khaas kar facebookexternalhit aur WhatsApp — jab koi link WhatsApp
   par chipkaata hai to WhatsApp khud page kholkar preview banata
   hai. Wo click nahi hai. Bina iske har link share par influencer ko
   ek jhootha click mil jaata.

   Asli user jo WhatsApp se aata hai, wo apne browser mein khulta hai
   (Chrome/Safari ka UA) — wo nahi chhanta.                          */
const BOT = /(bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|preview|headless|phantom|puppeteer|playwright|lighthouse|pingdom|uptime|curl|wget|python-requests|go-http|axios|node-fetch|okhttp)/i;

const looksLikeBot = (ua) => !ua || String(ua).length < 15 || BOT.test(ua);

/* ── Rate limit ──────────────────────────────────────────────────
   chat.routes.js wala hi tareeka — in-memory. Render par ek hi
   instance chalta hai to kaafi hai; instance badhe to limit
   per-instance ho jayegi (ye limitation document ki hui hai).       */
const hits = new Map();

const rateLimited = (key, max = 30, windowMs = 60000) => {
  const now = Date.now();
  const row = hits.get(key);

  if (!row || now > row.resetAt) {
    hits.set(key, { n: 1, resetAt: now + windowMs });
    // Map ko badhne se rokna — purani entries hata do
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    return false;
  }

  row.n += 1;
  return row.n > max;
};

/** Proxy ke peeche asli IP. Render X-Forwarded-For bhejta hai. */
const clientIp = (req) =>
  String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
  (req.socket && req.socket.remoteAddress) ||
  "";

const clip = (v, n = 80) => String(v || "").trim().slice(0, n);

module.exports = {
  isEnabled,
  SOURCES,
  SOURCE_LABEL,
  signToken,
  verifyToken,
  classify,
  hasSignal,
  mergeTouches,
  visitorHash,
  looksLikeBot,
  rateLimited,
  clientIp,
  clip,
  TOKEN_DAYS,
};

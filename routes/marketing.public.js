const express = require("express");
const router = express.Router();

const Influencer   = require("../models/Influencer");
const ReferralClick = require("../models/ReferralClick");
const Event        = require("../models/Event");
const A            = require("../utils/attribution");

/* ═══════════════════════════════════════════════════════════════
   POST /api/track/visit

   Ise Next.js ka route handler bulata hai (browser seedha nahi),
   kyunki cookie first-party honi chahiye — frontend valleyrun.in
   par hai aur backend onrender.com par, to backend ka set kiya
   cookie third-party hota aur Safari/Firefox use block kar dete.

   Yahan se sirf ek signed token wapas jaata hai. Usme kya likha hai
   ye client na padh sakta hai na badal sakta — isiliye koi apne aap
   ko kisi influencer ka laaya hua nahi bata sakta.

   ⚠️ Ye endpoint kabhi 5xx nahi deta. Visitor ka page iske bharose
   par nahi chalna chahiye.
   ═══════════════════════════════════════════════════════════════ */

router.post("/visit", async (req, res) => {
  /* Kuch bhi ho jaye, jawab 200 — ye tracking hai, zaroorat nahi.
     Token khali bhejna "attribution nahi mili" ka saaf matlab hai. */
  const give = (token = "") => res.json({ ok: true, token });

  try {
    if (!A.isEnabled()) return give();

    /* Next hamesha asli visitor ka IP/UA aage bhejta hai — socket par
       to Vercel ka IP aayega. Ye header koi aur bhi bhej sakta hai,
       isliye ispar sirf visitor-hash aur rate-limit tike hain; asli
       attribution kabhi iske bharose nahi. */
    const ip = A.clip(req.headers["x-vr-ip"] || A.clientIp(req), 60);
    const ua = A.clip(req.headers["x-vr-ua"] || req.headers["user-agent"], 250);

    /* Do taale: ek claim kiye hue IP par (jhoothe click rokne ke
       liye), ek asli socket par (poore endpoint ko bachane ke liye).
       Socket wali seema badi hai kyunki legit traffic Vercel ke
       chand IP se hi aata hai. */
    if (A.rateLimited("vis:" + ip, 30, 60000)) return give();
    if (A.rateLimited("sock:" + A.clientIp(req), 1200, 60000)) return give();

    /* Purana token — isse first-touch pata chalta hai */
    const prev = A.verifyToken(req.body.token) || {};

    const utm = {
      source:   A.clip(req.body.utm_source,   60),
      medium:   A.clip(req.body.utm_medium,   60),
      campaign: A.clip(req.body.utm_campaign, 80),
      content:  A.clip(req.body.utm_content,  80),
      term:     A.clip(req.body.utm_term,     80),
    };

    const referrer    = A.clip(req.body.referrer, 300);
    const landingPage = A.clip(req.body.landing, 200);

    /* ── Influencer code ──
       Code sirf tab chalta hai jab influencer maujood ho AUR active
       ho. Band kiye gaye influencer ko naya credit nahi milta, par
       uska purana data jaisa ka taisa rehta hai. */
    let influencer = null;
    const code = Influencer.cleanCode(req.body.via);

    if (code) {
      influencer = await Influencer.findOne({ code, isActive: true })
        .select("_id code eventIds")
        .lean();
    }

    const source = A.classify({
      hasInfluencer: Boolean(influencer),
      utm,
      referrer,
    });

    /* ── Click record ──
       Sirf asli influencer ke liye, aur bot ke liye bilkul nahi.
       WhatsApp par link chipkaane se WhatsApp khud page kholta hai
       preview banane ko — wo click nahi hai. */
    if (influencer && !A.looksLikeBot(ua)) {
      let event = null;
      const eventSlug = A.clip(req.body.eventSlug, 120);
      if (eventSlug) {
        event = await Event.findOne({ slug: eventSlug }).select("_id").lean();
      }

      /* Click save hona visitor ka kaam nahi rokta */
      ReferralClick.create({
        code:        influencer.code,
        influencer:  influencer._id,
        event:       event ? event._id : null,
        eventSlug:   eventSlug || "",
        visitorHash: A.visitorHash(ip, ua),
        landingPage,
        source,
        medium:      utm.medium,
        campaign:    utm.campaign,
      }).catch((err) => console.error("click save:", err.message));
    }

    const merged = A.mergeTouches(prev, {
      source,
      medium:   utm.medium,
      campaign: utm.campaign,
      content:  utm.content,
      term:     utm.term,
      influencerId: influencer ? String(influencer._id) : "",
      code:         influencer ? influencer.code : "",
      eventIdsSnap: influencer ? (influencer.eventIds || []).map(String) : [],
    });

    /* Kuch bhi naya nahi mila aur pehle se bhi kuch nahi tha —
       khali token banane ka koi fayda nahi */
    if (!merged.firstTouchSource) return give();

    return give(A.signToken(merged));
  } catch (err) {
    console.error("track visit:", err.message);
    return give();
  }
});

module.exports = router;

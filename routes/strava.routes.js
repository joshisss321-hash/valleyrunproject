const express = require("express");
const router  = express.Router();

const { protectUser } = require("../middleware/userAuth");
const { verifyUserToken } = require("../utils/userToken");
const StravaAccount = require("../models/StravaAccount");
const User = require("../models/User");
const strava = require("../utils/strava");
const { applyActivity, removeActivity } = require("../utils/streakSync");

const SITE_URL = process.env.SITE_URL || "https://valleyrun.in";

/* Strava set hi nahi hai to saaf jawab do — 404 ki paheli nahi */
const needsConfig = (res) =>
  res.status(503).json({
    success: false,
    code: "STRAVA_NOT_CONFIGURED",
    message: "Strava is not connected on this site yet.",
  });

/* ═══════════════════════════════════════════════════════════
   GET /api/strava/connect?token=<user jwt>
   Browser seedha yahan aata hai, isliye header nahi bhej sakta —
   token query mein aata hai. Yahin jaanch kar Strava par bhej dete hain.
═══════════════════════════════════════════════════════════ */
router.get("/connect", async (req, res) => {
  if (!strava.isConfigured()) return needsConfig(res);

  const decoded = verifyUserToken(String(req.query.token || ""));
  if (!decoded?.id) {
    return res.redirect(`${SITE_URL}/login?next=/profile&reason=strava`);
  }

  const user = await User.findById(decoded.id).select("_id");
  if (!user) return res.redirect(`${SITE_URL}/login?next=/profile`);

  res.redirect(strava.authorizeUrl(user._id));
});

/* ═══════════════════════════════════════════════════════════
   GET /api/strava/callback
   Strava yahan wapas bhejta hai. Yahin tokens banते hain aur save
   hote hain — browser ko token kabhi nahi milta.
═══════════════════════════════════════════════════════════ */
router.get("/callback", async (req, res) => {
  const back = (q) => res.redirect(`${SITE_URL}/profile?${q}`);

  if (!strava.isConfigured()) return back("strava=notconfigured");

  // User ne "Authorize" ki jagah "Cancel" dabaya
  if (req.query.error) return back("strava=cancelled");

  const userId = strava.readState(String(req.query.state || ""));
  if (!userId) return back("strava=expired");   // 10 min se zyada lag gaya

  const code = String(req.query.code || "");
  if (!code) return back("strava=failed");

  /* Scope ki jaanch: user checkbox hata sakta hai. Bina activity:read
     ke sync hoga hi nahi, isliye pehle hi saaf bata do. */
  const granted = String(req.query.scope || "");
  if (!granted.includes("activity:read")) return back("strava=noactivityscope");

  try {
    const t = await strava.exchangeCode(code);
    const athlete = t.athlete || {};
    const athleteId = String(athlete.id);

    /* Ye Strava account kisi AUR ke paas to nahi? Do log ek hi Strava
       se nahi jud sakte — warna ek ki activity dusre ke din tick kar
       degi. */
    const clash = await StravaAccount.findOne({ athleteId, user: { $ne: userId } });
    if (clash && !clash.disconnectedAt) return back("strava=alreadylinked");

    const fields = {
      user: userId,
      athleteId,
      accessToken:  t.access_token,
      refreshToken: t.refresh_token,
      expiresAt:    new Date(t.expires_at * 1000),
      scope:        granted,
      athleteName:  [athlete.firstname, athlete.lastname].filter(Boolean).join(" "),
      athletePhoto: athlete.profile_medium || athlete.profile || "",
      connectedAt:  new Date(),
      disconnectedAt: null,
      refreshFailures: 0,
      lastError: "",
    };

    // Purana (chhoda hua) account ho to usi ko zinda karo
    await StravaAccount.findOneAndUpdate(
      { $or: [{ user: userId }, { athleteId }] },
      fields,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    back("strava=connected");
  } catch (err) {
    console.error("Strava callback failed:", err.message);
    back("strava=failed");
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/strava/disconnect
   User ka haq bhi hai aur Strava ki shart bhi.
═══════════════════════════════════════════════════════════ */
router.post("/disconnect", protectUser, async (req, res) => {
  try {
    const acc = await StravaAccount.findOne({ user: req.user._id });
    if (!acc) return res.json({ success: true, message: "Strava was not connected" });

    /* Strava ko bhi bata do — sirf apne paas se hataana aadha kaam hai.
       Fail ho jaye to bhi hamare taraf se disconnect pakka hoga. */
    try {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: { Authorization: `Bearer ${acc.accessToken}` },
      });
    } catch {}

    acc.disconnectedAt = new Date();
    acc.accessToken = "";
    acc.refreshToken = "";
    await acc.save();

    res.json({ success: true, message: "Strava disconnected" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/strava/webhook   — Strava ki verification
   Subscription banate waqt Strava ek baar yahan aata hai aur
   hub.challenge wapas maangta hai.
═══════════════════════════════════════════════════════════ */
router.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return res.json({ "hub.challenge": challenge });
  }
  res.status(403).json({ success: false, message: "Verification failed" });
});

/* ═══════════════════════════════════════════════════════════
   POST /api/strava/webhook   — nayi/badli/hati activity

   ⚠️ Ye URL public hai — koi bhi POST kar sakta hai. Isliye event ke
      body par bharosa NAHI karte: usme se sirf athlete id aur activity
      id lete hain, aur activity ki asli jaankari Strava se khud
      padhte hain. Warna koi bhi nakli event bhejkar din tick karwa leta.

   Strava 2 second mein 200 maangta hai, warna subscription band kar
   deta hai. Isliye pehle 200 bhejte hain, kaam uske baad.
═══════════════════════════════════════════════════════════ */
router.post("/webhook", (req, res) => {
  res.status(200).json({ received: true });

  const event = req.body || {};
  setImmediate(() => handleEvent(event).catch((err) =>
    console.error("Strava webhook error:", err.message)
  ));
});

const handleEvent = async (event) => {
  if (event.object_type !== "activity") return;   // athlete events abhi nahi chahiye

  const account = await strava.accountForAthlete(event.owner_id);
  if (!account) return;   // ye athlete hamara nahi

  const activityId = String(event.object_id);

  if (event.aspect_type === "delete") {
    await removeActivity(account.user, activityId);
    return;
  }

  // create ya update — dono par activity Strava se khud padho
  const activity = await strava.fetchActivity(account, activityId);
  await applyActivity(account.user, activity);

  account.lastSyncAt = new Date();
  await account.save();
};

module.exports = router;

const jwt = require("jsonwebtoken");
const StravaAccount = require("../models/StravaAccount");

/**
 * Strava se baat karne ka ek hi raasta.
 *
 * Sabse zaroori baat: har refresh par Strava NAYA refresh token de sakta
 * hai, aur purana usi waqt mar jaata hai. Agar naya save na kiya to agli
 * baar connection toot jaayega aur banda bina kuch kiye "reconnect" dekhega.
 * Isliye token ka kaam sirf yahin hota hai, har route apna nahi karta.
 */

const AUTH_URL  = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE  = "https://www.strava.com/api/v3";

/* Streak ke liye itna hi chahiye. Jitna kam maangenge, utna kam log
   "ye itna sab kyun maang raha hai" sochkar peeche hatenge.
   activity:read_all private activities ke liye — warna private run
   gini hi nahi jaayegi aur banda pareshan hoga. */
const SCOPE = "read,activity:read_all";

const cfg = () => ({
  clientId:     process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  redirectUri:  process.env.STRAVA_REDIRECT_URI,
});

/** Strava set hai ya nahi — route isi se tay karta hai ki 503 dena hai */
const isConfigured = () => {
  const c = cfg();
  return Boolean(c.clientId && c.clientSecret && c.redirectUri);
};

/* ── Connect ka raasta ──
   `state` mein poora user JWT nahi bhejte — ek chhota, 10 minute ka
   token banate hain jisme sirf userId hai. URL browser history aur
   Strava ke logs mein rehta hai; usme 30-din ka login token daalna
   theek nahi. */
const makeState = (userId) =>
  jwt.sign({ uid: String(userId), typ: "strava_connect" }, process.env.JWT_SECRET, { expiresIn: "10m" });

const readState = (state) => {
  try {
    const d = jwt.verify(state, process.env.JWT_SECRET);
    return d?.typ === "strava_connect" ? d.uid : null;
  } catch {
    return null;
  }
};

const authorizeUrl = (userId) => {
  const c = cfg();
  const q = new URLSearchParams({
    client_id:       c.clientId,
    redirect_uri:    c.redirectUri,
    response_type:   "code",
    approval_prompt: "auto",
    scope:           SCOPE,
    state:           makeState(userId),
  });
  return `${AUTH_URL}?${q}`;
};

/* ── Code → tokens ── */
const exchangeCode = async (code) => {
  const c = cfg();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Strava token exchange failed (${res.status})`);
  }
  return body;
};

/* ── Refresh ──
   Strava khud dekhta hai: agar token mein 1 ghante se zyada bacha hai to
   wahi lauta deta hai. Isliye bina dar ke call kar sakte hain. */
const refreshTokens = async (refreshToken) => {
  const c = cfg();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Strava refresh failed (${res.status})`);
  }
  return body;
};

/**
 * Chalu access token lao — zaroorat ho to refresh karke.
 * 10 minute ka margin rakha hai: thik expiry par refresh karna risky hai,
 * beech mein request fail ho jaati hai.
 */
const validAccessToken = async (account) => {
  const marginMs = 10 * 60 * 1000;

  if (account.expiresAt && account.expiresAt.getTime() - Date.now() > marginMs) {
    return account.accessToken;
  }

  try {
    const t = await refreshTokens(account.refreshToken);

    account.accessToken  = t.access_token;
    account.refreshToken = t.refresh_token || account.refreshToken;  // naya aaye to wahi
    account.expiresAt    = new Date(t.expires_at * 1000);
    account.refreshFailures = 0;
    account.lastError = "";
    await account.save();

    return account.accessToken;
  } catch (err) {
    account.refreshFailures = (account.refreshFailures || 0) + 1;
    account.lastError = err.message;
    await account.save();
    throw err;
  }
};

/** Strava API call — token ka hisaab apne aap */
const stravaGet = async (account, path) => {
  const token = await validAccessToken(account);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Token to abhi theek tha — matlab user ne Strava par access hata diya
    account.refreshFailures = 3;
    account.lastError = "Access revoked on Strava";
    await account.save();
    throw new Error("Strava access was revoked");
  }

  if (res.status === 429) {
    throw new Error("Strava rate limit reached — will retry later");
  }

  if (!res.ok) {
    throw new Error(`Strava returned ${res.status} for ${path}`);
  }

  return res.json();
};

/** Ek activity ki poori jaankari — webhook ke baad yahi chalti hai */
const fetchActivity = (account, activityId) =>
  stravaGet(account, `/activities/${activityId}`);

/** athleteId se hamara account — webhook ka pehla kadam */
const accountForAthlete = (athleteId) =>
  StravaAccount.findOne({ athleteId: String(athleteId), disconnectedAt: null });

module.exports = {
  SCOPE, isConfigured, authorizeUrl, readState,
  exchangeCode, refreshTokens, validAccessToken,
  stravaGet, fetchActivity, accountForAthlete,
};

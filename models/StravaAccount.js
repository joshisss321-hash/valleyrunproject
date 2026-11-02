const mongoose = require("mongoose");

/* Ek runner ka Strava connection.
   Token kabhi browser tak nahi jaata — sirf server padhta hai.
   Access token 6 ghante chalta hai, isliye refreshToken zaroori hai. */
const stravaAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    /* Strava ka athlete id. Webhook isi se batata hai ki activity kiski hai,
       isliye unique aur indexed — warna har event par poora collection
       scan hota. */
    athleteId: { type: String, required: true, unique: true, index: true },

    /* required NAHI: disconnect par ye jaan-bujh kar khali kar dete hain.
       Required rakhne par disconnect hi fail ho jaata tha aur token
       database mein pada rehta — wo galat bhi hai aur khatarnak bhi. */
    accessToken:  { type: String, default: "" },
    refreshToken: { type: String, default: "" },
    expiresAt:    { type: Date,   default: null },   // access token kab tak

    scope:       { type: String, default: "" },
    athleteName: { type: String, default: "" },
    athletePhoto:{ type: String, default: "" },

    connectedAt:    { type: Date, default: Date.now },
    lastSyncAt:     { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },

    /* Token refresh baar-baar fail ho raha hai? User ko dobara connect
       karne ko kehna padega — chup-chaap fail hone se streak toot jaati. */
    refreshFailures: { type: Number, default: 0 },
    lastError:       { type: String, default: "" },
  },
  { timestamps: true }
);

/** Abhi juda hua hai? */
stravaAccountSchema.methods.isActive = function () {
  return !this.disconnectedAt;
};

module.exports = mongoose.model("StravaAccount", stravaAccountSchema);

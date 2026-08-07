const jwt = require("jsonwebtoken");

const USER_TOKEN_DAYS = 30;

/**
 * User (runner) ka JWT. `typ: "user"` claim isliye hai taaki
 * ye token galti se bhi admin routes pe accept na ho jaye.
 */
const signUserToken = (user) =>
  jwt.sign(
    {
      id:    user._id.toString(),
      email: user.email,
      typ:   "user",
    },
    process.env.JWT_SECRET,
    { expiresIn: `${USER_TOKEN_DAYS}d` }
  );

/** Valid ho to payload, warna null. Kabhi throw nahi karta. */
const verifyUserToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.typ !== "user") return null;
    return decoded;
  } catch {
    return null;
  }
};

module.exports = { signUserToken, verifyUserToken, USER_TOKEN_DAYS };

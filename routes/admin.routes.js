const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (
    email === "admin@valleyrun.in" &&
    password === "123456"
  ) {
    const token = jwt.sign({ role: "admin" }, "SECRET123");

    return res.json({
      success: true,
      token,
    });
  }

  res.json({
    success: false,
    message: "Invalid credentials",
  });
});

module.exports = router;
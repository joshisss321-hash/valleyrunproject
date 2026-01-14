const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const paymentRoutes = require("./routes/payment.routes");
const registrationRoutes = require("./routes/registration.routes");
const adminRoutes = require("./routes/admin.routes");
const eventRoutes = require("./routes/event.routes");

const app = express();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.send("API running ✅");
});

app.use("/api/payment", paymentRoutes);
app.use("/api/register", registrationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/leaderboard", require("./routes/leaderboard.routes"));


module.exports = app;

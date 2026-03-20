const https = require("https");

const sendEmail = async ({ to, subject, html }) => {
  try {
    console.log("📧 Sending email to:", to);

    const payload = JSON.stringify({
      sender: {
        name: "Valley Run",
        email: process.env.EMAIL_REPLY_TO,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });

    await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log("✅ Email sent via Brevo API");
            resolve(true);
          } else {
            console.error("❌ Brevo API error:", data);
            resolve(false);
          }
        });
      });

      req.on("error", (err) => {
        console.error("❌ Email request error:", err.message);
        resolve(false);
      });

      req.setTimeout(30000, () => {
        console.error("❌ Email request timeout");
        req.destroy();
        resolve(false);
      });

      req.write(payload);
      req.end();
    });

    return true;
  } catch (err) {
    console.error("❌ Email error:", err.message);
    return false;
  }
};

module.exports = sendEmail;

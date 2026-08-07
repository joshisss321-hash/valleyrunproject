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

    const ok = await new Promise((resolve, reject) => {
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
            console.log("✅ Email sent via Brevo API →", to);
            resolve(true);
          } else {
            // Brevo ki asli wajah saaf dikhni chahiye — code aur message dono
            let reason = data;
            try {
              const parsed = JSON.parse(data);
              reason = `${parsed.code || res.statusCode}: ${parsed.message || data}`;
            } catch { /* JSON nahi hai to raw hi theek hai */ }

            console.error(`❌ BREVO NE MANA KIYA (HTTP ${res.statusCode}) → ${to}`);
            console.error(`   Wajah: ${reason}`);
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

    /* ⚠️ Yahan pehle seedha `return true` tha — upar wala promise
       true/false deta hai, par uska jawab phenk diya jaata tha.
       Isliye Brevo email reject bhi kar de to poore app ko lagta tha
       "bhej di gayi": OTP na aata, par log kehta "sent". */
    return ok;
  } catch (err) {
    console.error("❌ Email error:", err.message);
    return false;
  }
};

module.exports = sendEmail;

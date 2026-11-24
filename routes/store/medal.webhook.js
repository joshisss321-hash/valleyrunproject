const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const { markPaid, markFailed } = require("../../utils/store/medalOrder");

/* ═══════════════════════════════════════════════════════════════
   MEDAL STORE — Razorpay webhook

   ⚠️ Ye apna alag endpoint hai, aur ye jaan-bujh kar hai.

   Live registration ka webhook (`routes/webhook.js`) chhune ki koi
   zaroorat nahi padi: wo `notes.eventSlug` na mile to turant ruk
   jaata hai, aur medal order ke notes mein wo naam hai hi nahi. Us
   file mein ek line badalne ka matlab hota roz chalti registrations
   ko khatre mein daalna.

   Razorpay dashboard mein ye doosra URL jodna hoga. Dono webhook
   har payment par aayenge: wo medal payment ko nazarandaz karega
   (eventSlug nahi), aur ye event payment ko (us razorpay order id
   ka koi medal order nahi milega). Dono chup-chaap laut jaate hain.

   ⚠️ Ise app.js mein express.json() se PEHLE mount karna zaroori
   hai. Signature raw bytes par banta hai; ek baar JSON parse ho
   gaya to wo bytes wapas nahi mil sakte.
   ═══════════════════════════════════════════════════════════════ */

router.post(
  "/medal-store/webhook",
  express.raw({ type: "*/*" }),
  (req, res) => {
    /* Razorpay ko turant 200 — warna wo baar-baar bhejta rehta hai.
       Asli kaam peeche chalta hai. Yahi tareeka live webhook mein
       bhi hai. */
    res.status(200).json({ received: true });

    setImmediate(async () => {
      try {
        const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];
        if (!secret || !signature) return;

        const raw = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));

        const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");

        if (expected.length !== String(signature).length) return;
        if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)))) {
          console.log("❌ Medal webhook: signature mismatch");
          return;
        }

        const event = JSON.parse(raw.toString());
        const payment = event?.payload?.payment?.entity;
        if (!payment?.order_id) return;

        /* Sirf medal ke orders. Event registration ka payment bhi
           yahan aayega — uska koi medal order nahi milega aur
           markPaid chup-chaap `Order not found` lauta dega. */
        if (event.event === "payment.captured") {
          const r = await markPaid({
            razorpayOrderId: payment.order_id,
            paymentId: payment.id,
          });
          if (r.ok && !r.alreadyDone) {
            console.log(`✅ Medal order paid (webhook): ${r.order.orderNo}`);
          }
          return;
        }

        if (event.event === "payment.failed") {
          await markFailed({
            razorpayOrderId: payment.order_id,
            reason: payment.error_description || "Payment failed",
          });
          return;
        }
      } catch (err) {
        console.error("medal webhook:", err.message);
      }
    });
  }
);

module.exports = router;

const crypto = require("crypto");

const StoreOrder    = require("../../models/store/StoreOrder");
const MedalSettings = require("../../models/store/MedalSettings");
const sendEmail     = require("../sendEmail");
const { finalise, releaseOrder } = require("./medalStock");
const orderEmail    = require("../emailTemplates/medalOrder");

/* ═══════════════════════════════════════════════════════════════
   Payment pakka hone par kya-kya hota hai — EK jagah.

   Do raaste ispar aate hain: frontend ka verify call, aur Razorpay
   ka webhook. Dono ek saath aa sakte hain, ya webhook paanch baar
   aa sakta hai. Isliye saara bachav yahin andar hai, callers ko
   kuch sochna nahi padta.
   ═══════════════════════════════════════════════════════════════ */

/** Razorpay ka signature — verify call ke liye. */
const validSignature = ({ orderId, paymentId, signature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  // Lambai alag ho to timingSafeEqual khud throw karta hai
  if (expected.length !== String(signature).length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
};

/* ───────────────────────────────────────────────────────────────
   markPaid — order ko paid karo aur stock sach mein ghatao

   Idempotent. Dobara bulao to `alreadyDone: true` milta hai aur
   kuch nahi hota: na stock dobara ghatta, na email dobara jaati.
─────────────────────────────────────────────────────────────── */
const markPaid = async ({ razorpayOrderId, paymentId }) => {
  const order = await StoreOrder.findOne({ razorpayOrderId, kind: "medal" });
  if (!order) return { ok: false, reason: "Order not found" };

  /* Stock pehle. `finalise` ke andar `stockApplied` par atomic
     taala hai — paanch call ek saath aayein to ek hi aage badhti
     hai. Jo jeeti, wahi email bhejegi. */
  const done = await finalise(order._id);

  if (done.alreadyDone) {
    return { ok: true, alreadyDone: true, order };
  }

  await StoreOrder.updateOne(
    { _id: order._id },
    {
      $set: {
        paymentStatus: "paid",
        orderStatus:   "confirmed",
        razorpayPaymentId: paymentId || "",
        paidAt: new Date(),
        stockReserved: false,     // rok ab bikri ban chuki hai
      },
      $push: {
        statusHistory: { status: "confirmed", note: "Payment received", by: "system", at: new Date() },
      },
    }
  );

  const fresh = await StoreOrder.findById(order._id).lean();

  /* Email bhejna order ko nahi rok sakta — paisa aa chuka hai.
     Isliye fire-and-forget, apne catch ke saath. */
  sendOrderEmails(fresh).catch((e) => console.error("medal order email:", e.message));

  return { ok: true, alreadyDone: false, order: fresh };
};

/** Customer ko confirmation, aur admin ko khabar. */
const sendOrderEmails = async (order) => {
  const settings = await MedalSettings.get();

  await sendEmail({
    to: order.email,
    subject: `Order confirmed — ${order.orderNo} · Valley Run Medal Store`,
    html: orderEmail({ order, settings }),
  });

  const admins = (settings.notifyEmails || []).filter(Boolean);
  if (admins.length) {
    const lines = order.items
      .map((i) => `${i.qty} × ${i.name}`)
      .join("<br>");
    await sendEmail({
      to: admins.join(","),
      subject: `New medal order ${order.orderNo} — ₹${order.total}`,
      html:
        `<p><strong>${order.orderNo}</strong></p><p>${lines}</p>` +
        `<p>${order.name || ""}<br>${order.phone}<br>${order.email}</p>` +
        `<p>${[order.address?.line1, order.address?.line2, order.address?.landmark,
               order.address?.city, order.address?.state, order.address?.pincode]
               .filter(Boolean).join(", ")}</p>` +
        `<p>Total ₹${order.total} (shipping ₹${order.shipping})</p>`,
    }).catch(() => {});
  }
};

/* ───────────────────────────────────────────────────────────────
   markFailed — payment fail / cancel

   Rok hat jaati hai, `stock` ko kuch hua hi nahi tha.
─────────────────────────────────────────────────────────────── */
const markFailed = async ({ razorpayOrderId, reason = "Payment failed" }) => {
  const order = await StoreOrder.findOne({ razorpayOrderId, kind: "medal" });
  if (!order) return { ok: false };

  // Paid ho chuka hai to haath mat lagao
  if (order.paymentStatus === "paid") return { ok: true, alreadyPaid: true };

  await releaseOrder(order._id, "cancel");

  await StoreOrder.updateOne(
    { _id: order._id, paymentStatus: { $ne: "paid" } },
    {
      $set: { paymentStatus: "failed", orderStatus: "cancelled", cancelledAt: new Date() },
      $push: { statusHistory: { status: "cancelled", note: reason, by: "system", at: new Date() } },
    }
  );

  return { ok: true };
};

module.exports = { validSignature, markPaid, markFailed, sendOrderEmails };

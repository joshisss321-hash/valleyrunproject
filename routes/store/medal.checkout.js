const express = require("express");
const router = express.Router();

const StoreProduct  = require("../../models/store/StoreProduct");
const StoreOrder    = require("../../models/store/StoreOrder");
const MedalSettings = require("../../models/store/MedalSettings");
const razorpay      = require("../../config/rozarpay");
const { generateOrderNo } = require("../../utils/store/orderNo");
const { reserve, releaseOrder, sweepExpired, available } = require("../../utils/store/medalStock");
const { validSignature, markPaid, markFailed } = require("../../utils/store/medalOrder");

/* ═══════════════════════════════════════════════════════════════
   MEDAL STORE — checkout

   Abhi ek order mein ek hi tarah ka medal (quantity jitni marzi).
   Par order `items[]` array hi hai — aage cart jodna ho to sirf
   yahan loop lagana padega, poora dhaancha nahi badalna padega.
   ═══════════════════════════════════════════════════════════════ */

const MAX_QTY = 10;

const clean = (v, n = 120) => String(v || "").trim().slice(0, n);

const required = (form) => {
  const need = {
    name: "Full name", email: "Email", phone: "Mobile number",
    address1: "House / flat number", address2: "Street / area",
    city: "City", state: "State", pincode: "PIN code",
  };
  for (const [k, label] of Object.entries(need)) {
    if (!clean(form[k])) return `${label} is required.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(form.email)) return "That email does not look right.";
  if (!/^\d{10}$/.test(String(form.phone).replace(/\D/g, "").slice(-10))) {
    return "Please enter a 10-digit mobile number.";
  }
  if (!/^\d{6}$/.test(String(form.pincode).trim())) return "PIN code must be 6 digits.";
  return "";
};

/* ═══════════════════════════════════════════════
   POST /api/medal-store/checkout
═══════════════════════════════════════════════ */
router.post("/checkout", async (req, res) => {
  let orderDoc = null;

  try {
    /* Purane pade reservations pehle chhod do — ho sakta hai jo maal
       "khatam" dikh raha hai wo sirf kisi adhoore payment ne roka ho.
       Cron nahi hai, isliye safai wahin jahan kaam ho raha hai. */
    await sweepExpired().catch(() => {});

    const slug = clean(req.body.slug, 160);
    const qty  = Math.floor(Number(req.body.qty) || 0);

    const bad = required(req.body);
    if (bad) return res.status(400).json({ success: false, message: bad });

    if (qty < 1 || qty > MAX_QTY) {
      return res.status(400).json({ success: false, message: `Please choose between 1 and ${MAX_QTY}.` });
    }

    const product = await StoreProduct.findOne({ slug, kind: "medal" }).lean();
    if (!product || !product.isPublished) {
      return res.status(404).json({ success: false, message: "This medal is not available." });
    }

    /* Medals mein variants nahi hote. Agar kisi ne admin se laga
       diye to `resolveLine` top-level stock ko nazarandaz kar deta
       hai aur reservation ka hisaab galat ho jaata — isliye saaf
       mana, chup-chaap galat order banane se behtar. */
    if ((product.variants || []).some((v) => v.isActive !== false)) {
      console.error(`⚠️ Medal ${product.slug} par variants laga diye gaye hain — checkout roka`);
      return res.status(400).json({
        success: false,
        message: "This medal cannot be bought right now. Please contact us.",
      });
    }

    /* ── Daam SERVER se, client se nahi ── */
    const unitPrice = Number(product.price) || 0;
    if (unitPrice < 1) {
      return res.status(400).json({ success: false, message: "This medal has no price set yet." });
    }

    const settings = await MedalSettings.get();
    const subtotal = unitPrice * qty;
    const shipping = MedalSettings.shippingFor(settings, subtotal);
    const total    = subtotal + shipping;

    /* ── Maal rok lo — stock ko abhi haath nahi ── */
    const held = await reserve(product._id, qty);
    if (!held.ok) {
      return res.status(409).json({
        success: false,
        code: "OUT_OF_STOCK",
        message: held.reason,
        left: held.left ?? 0,
      });
    }

    /* ── Order bana do (abhi pending) ── */
    const phone10 = String(req.body.phone).replace(/\D/g, "").slice(-10);

    orderDoc = await StoreOrder.create({
      orderNo: await generateOrderNo(),
      kind: "medal",
      email: clean(req.body.email, 160).toLowerCase(),
      phone: phone10,
      name:  clean(req.body.name),
      address: {
        name:  clean(req.body.name),
        phone: phone10,
        line1: clean(req.body.address1),
        line2: clean(req.body.address2),
        landmark: clean(req.body.landmark),
        city:  clean(req.body.city),
        state: clean(req.body.state),
        pincode: clean(req.body.pincode, 6),
      },
      items: [{
        product: product._id,
        name:    product.name,
        image:   product.featuredImage || product.images?.[0]?.url || "",
        qty,
        unitPrice,
        lineTotal: subtotal,
        weightGm: product.weightGm || 0,
      }],
      subtotal,
      shipping,
      total,
      paymentMethod: "razorpay",
      customerNote: clean(req.body.note, 300),
      stockReserved: true,
      statusHistory: [{ status: "pending_payment", note: "Checkout started", by: "customer", at: new Date() }],
    });

    /* ── Razorpay order ──
       ⚠️ notes mein `eventSlug` JAAN-BUJH KAR nahi hai. Live
       registration ka webhook `notes.eventSlug` na mile to turant
       ruk jaata hai — isi wajah se wo file chhune ki zaroorat nahi
       padi. Ye naam yahan kabhi mat daalna. */
    const rzp = await razorpay.orders.create({
      amount:   Math.round(total * 100),
      currency: "INR",
      receipt:  orderDoc.orderNo,
      notes: {
        medalOrderNo: orderDoc.orderNo,
        kind: "medal",
        name:  orderDoc.name,
        email: orderDoc.email,
        phone: orderDoc.phone,
      },
    });

    orderDoc.razorpayOrderId = rzp.id;
    await orderDoc.save();

    res.json({
      success: true,
      orderNo: orderDoc.orderNo,
      order: { id: rzp.id, amount: rzp.amount, currency: rzp.currency },
      amounts: { unitPrice, qty, subtotal, shipping, total },
    });
  } catch (err) {
    console.error("medal checkout:", err);

    /* Razorpay ya database beech mein fail hua — rok hata do, warna
       wo maal bina bike 20 minute tak atka rehta. */
    if (orderDoc?._id) {
      await releaseOrder(orderDoc._id, "cancel").catch(() => {});
      await StoreOrder.updateOne(
        { _id: orderDoc._id },
        { $set: { paymentStatus: "failed", orderStatus: "cancelled", cancelledAt: new Date() } }
      ).catch(() => {});
    }

    res.status(500).json({ success: false, message: "Could not start the payment. Please try again." });
  }
});

/* ═══════════════════════════════════════════════
   POST /api/medal-store/verify
   Frontend se, payment ke turant baad.
═══════════════════════════════════════════════ */
router.post("/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!validSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    })) {
      /* Signature galat — kuch mat chhedo. Paisa sach mein aaya hoga
         to webhook use pakad lega; yahan maan lena khatarnak hai. */
      return res.status(400).json({ success: false, message: "Payment verification failed." });
    }

    const r = await markPaid({
      razorpayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });

    if (!r.ok) return res.status(404).json({ success: false, message: "Order not found." });

    res.json({ success: true, orderNo: r.order.orderNo, email: r.order.email });
  } catch (err) {
    console.error("medal verify:", err);
    res.status(500).json({ success: false, message: "Something went wrong. Please contact us with your payment id." });
  }
});

/* ═══════════════════════════════════════════════
   POST /api/medal-store/cancel
   User ne Razorpay ka window band kar diya. Rok turant hata do —
   warna wo medal 20 minute tak bina wajah atka rehta.

   ⚠️ Ispar bharosa nahi kiya jaata: koi bhi ye call kar sakta hai,
   isliye ye sirf pending order ko chhodti hai, paid ko kabhi nahi.
═══════════════════════════════════════════════ */
router.post("/cancel", async (req, res) => {
  try {
    await markFailed({
      razorpayOrderId: String(req.body.razorpay_order_id || ""),
      reason: "Customer closed the payment window",
    });
    res.json({ success: true });
  } catch {
    res.json({ success: true });   // ye user ka kaam nahi rok sakta
  }
});

/* ═══════════════════════════════════════════════
   GET /api/medal-store/order/:orderNo?email=
   Order ka haal. Login nahi hai, isliye email milna zaroori —
   warna koi bhi order number badal-badal kar doosron ka pata aur
   phone padh leta.
═══════════════════════════════════════════════ */
router.get("/order/:orderNo", async (req, res) => {
  try {
    const email = clean(req.query.email, 160).toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "Please enter the email you ordered with." });
    }

    const o = await StoreOrder.findOne({
      orderNo: clean(req.params.orderNo, 40).toUpperCase(),
      kind: "medal",
      email,
    }).lean();

    if (!o) {
      /* Order number galat hai ya email galat — dono ka ek hi jawab.
         Alag jawab dene se koi order number dhoondh sakta tha. */
      return res.status(404).json({
        success: false,
        message: "No order found with that number and email.",
      });
    }

    res.json({
      success: true,
      order: {
        orderNo: o.orderNo,
        placedAt: o.createdAt,
        items: o.items.map((i) => ({ name: i.name, image: i.image, qty: i.qty, lineTotal: i.lineTotal })),
        subtotal: o.subtotal,
        shipping: o.shipping,
        total: o.total,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        courier: o.courier,
        trackingId: o.trackingId,
        trackingUrl: o.trackingUrl,
        shippedAt: o.shippedAt,
        deliveredAt: o.deliveredAt,
        address: o.address,
        statusHistory: (o.statusHistory || []).map((h) => ({ status: h.status, note: h.note, at: h.at })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

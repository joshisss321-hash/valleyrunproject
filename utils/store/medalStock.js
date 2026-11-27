const StoreProduct  = require("../../models/store/StoreProduct");
const StoreOrder    = require("../../models/store/StoreOrder");
const StoreStockLog = require("../../models/store/StoreStockLog");

/* ═══════════════════════════════════════════════════════════════
   MEDAL STORE — STOCK ENGINE

   Teen shart ek saath poori karni thi:
     1. stock sirf verified payment ke baad kate
     2. ek saath do log aakhri medal na khareed lein
     3. fail payment stock ko permanently kam na kare

   Seedha padhein to 1 aur 2 ek saath nahi ho sakte — agar payment
   tak stock chhua hi nahi, to aakhri medal ke liye do log ek saath
   paisa de denge aur ek ko refund karna padega.

   Isliye do ginti hain:

       dikhne wala maal  =  stock − reserved

       checkout     :  reserved +qty      (stock ko haath nahi)
       payment pakka:  stock −qty, reserved −qty, soldCount +qty
       payment fail :  reserved −qty      (stock ko kuch hua hi nahi)
       20 min baad  :  wahi, apne aap

   `stock` sach mein tabhi ghatta hai jab paisa aa gaya. Phir bhi do
   log ek saath aakhri medal nahi le sakte, kyunki jagah pehle hi
   rok li gayi thi.

   ⚠️ Har likhai ek hi atomic findOneAndUpdate hai, shart ke saath.
   Read karke phir write karna yahan sabse badi galti hoti — do
   request ke beech mein database badal sakta hai.
   ═══════════════════════════════════════════════════════════════ */

/** Jitni der tak bina paise ke maal roka ja sakta hai. Razorpay ka
 *  apna window ~15 min hai; 20 min thoda sa hashiya chhodta hai. */
const HOLD_MINUTES = 20;

/** Kitna maal sach mein khareeda ja sakta hai. */
const available = (p) =>
  Math.max(0, (Number(p?.stock) || 0) - (Number(p?.reserved) || 0));

/* ───────────────────────────────────────────────────────────────
   RESERVE — checkout par

   Shart database ke andar hi lagti hai ($expr), isliye do request
   ek saath aayein to Mongo ek hi ko jeetne deta hai. Doosri ko
   `null` milta hai, aur use saaf "itna hi bacha hai" bola jaata
   hai — paisa maangne se pehle.
─────────────────────────────────────────────────────────────── */
const reserve = async (productId, qty) => {
  const n = Math.floor(Number(qty) || 0);
  if (n < 1) return { ok: false, reason: "Please choose at least one medal." };

  const updated = await StoreProduct.findOneAndUpdate(
    {
      _id: productId,
      kind: "medal",
      isPublished: true,
      // (stock − reserved) >= n   — poora hisaab Mongo ke andar
      $expr: { $gte: [{ $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }, n] },
    },
    { $inc: { reserved: n } },
    { new: true }
  );

  if (updated) return { ok: true, product: updated };

  /* Nahi mila — ab wajah batani hai. Ye query sirf message banane ke
     liye hai; faisla upar ho chuka hai. */
  const p = await StoreProduct.findById(productId).lean();

  if (!p || p.kind !== "medal") return { ok: false, reason: "This medal is not available." };
  if (!p.isPublished)           return { ok: false, reason: "This medal is not on sale right now." };

  const left = available(p);
  if (left <= 0) return { ok: false, reason: "This medal just went out of stock.", left: 0 };

  return {
    ok: false,
    left,
    reason:
      left === 1
        ? "Only 1 left — please change the quantity to 1."
        : `Only ${left} left — please reduce the quantity.`,
  };
};

/* ───────────────────────────────────────────────────────────────
   RELEASE — payment fail, cancel, ya waqt khatam

   `stock` ko chhua hi nahi jaata, sirf rok hatti hai.
   `$max: 0` isliye ki do baar release ho jaye to bhi reserved
   minus mein na chala jaye.
─────────────────────────────────────────────────────────────── */
const release = async (productId, qty) => {
  const n = Math.floor(Number(qty) || 0);
  if (n < 1) return;

  await StoreProduct.updateOne(
    { _id: productId },
    [
      {
        $set: {
          reserved: { $max: [0, { $subtract: [{ $ifNull: ["$reserved", 0] }, n] }] },
        },
      },
    ]
  );
};

/* ───────────────────────────────────────────────────────────────
   FINALISE — payment verify hone ke baad. YAHI jagah hai jahan
   `stock` sach mein ghatta hai.

   ⚠️ Pehle order par taala lagta hai, product par baad mein.
   `stockApplied: false → true` ek atomic findOneAndUpdate hai: agar
   webhook aur verify dono ek saath aayein, ya wahi webhook paanch
   baar aaye, to sirf ek hi call aage badhti hai. Baaki ko `null`
   milta hai aur wo chup-chaap laut jaati hain.
─────────────────────────────────────────────────────────────── */
const finalise = async (orderId) => {
  const order = await StoreOrder.findOneAndUpdate(
    { _id: orderId, stockApplied: false },
    { $set: { stockApplied: true } },
    { new: true }
  );

  // Koi aur pehle hi kar chuka — bilkul theek hai, dobara nahi karna
  if (!order) return { ok: true, alreadyDone: true };

  for (const item of order.items || []) {
    if (!item.product) continue;
    const n = Math.floor(Number(item.qty) || 0);
    if (n < 1) continue;

    /* Ek hi atomic update mein teeno kaam: stock ghatao, rok hatao,
       bika badhao.

       Pipeline update isliye ki `reserved` ko 0 par rokna hai —
       saadha $inc kabhi data bigadne par use minus mein le ja sakta
       tha. `stock: { $gte: n }` ki shart filter mein hai, isliye
       stock kabhi minus nahi ho sakta. */
    const before = await StoreProduct.findOneAndUpdate(
      { _id: item.product, stock: { $gte: n } },
      [
        {
          $set: {
            stock:     { $subtract: ["$stock", n] },
            reserved:  { $max: [0, { $subtract: [{ $ifNull: ["$reserved", 0] }, n] }] },
            soldCount: { $add: [{ $ifNull: ["$soldCount", 0] }, n] },
          },
        },
      ],
      { new: false }
    );

    if (!before) {
      /* Yahan pahunchna nahi chahiye — reserve ne jagah rok rakhi
         thi. Par agar admin ne beech mein stock ghata diya ho to ho
         sakta hai. Paisa aa chuka hai, isliye order rokte nahi: saaf
         log chhodte hain taaki admin ko pata chale. */
      console.error(
        `⚠️ Medal stock finalise nahi hua (paisa aa chuka hai): order ${order.orderNo}, product ${item.product}, qty ${n}`
      );
      continue;
    }

    await StoreStockLog.create({
      product: item.product,
      delta:   -n,
      before:  before.stock,
      after:   before.stock - n,
      reason:  "order",
      order:   order._id,
      by:      "system",
      note:    `Order ${order.orderNo}`,
    }).catch((err) => console.error("stock log:", err.message));
  }

  return { ok: true, alreadyDone: false, order };
};

/* ───────────────────────────────────────────────────────────────
   RELEASE ORDER — poore order ki rok hatao (fail / cancel)

   `stockReserved: true → false` par bhi atomic taala, taaki do baar
   release hokar reserved galat na ho jaye.
─────────────────────────────────────────────────────────────── */
const releaseOrder = async (orderId, reason = "cancel") => {
  const order = await StoreOrder.findOneAndUpdate(
    { _id: orderId, stockReserved: true, stockApplied: false },
    { $set: { stockReserved: false } },
    { new: true }
  );

  if (!order) return { ok: true, alreadyDone: true };

  for (const item of order.items || []) {
    if (!item.product) continue;
    await release(item.product, item.qty);

    /* Log mein delta 0 — kyunki `stock` sach mein kabhi ghata hi
       nahi tha, sirf rok lagi thi aur hat gayi. Jhootha +N likhna
       admin ko confuse karta ki maal wapas kahan se aaya. */
    await StoreStockLog.create({
      product: item.product,
      delta:   0,
      reason,
      order:   order._id,
      by:      "system",
      note:    `Hold released (${item.qty}) — ${order.orderNo}`,
    }).catch(() => {});
  }

  return { ok: true, alreadyDone: false, order };
};

/* ───────────────────────────────────────────────────────────────
   SWEEP — bina paise ke pade reservations chhodna

   Cron nahi hai is project mein, aur sirf iske liye lagana zyadti
   hoti. Isliye ye har checkout se pehle aur admin ke orders page
   par khud chal jaata hai — jahan kaam ho raha hai, wahin safai.
─────────────────────────────────────────────────────────────── */
const sweepExpired = async (minutes = HOLD_MINUTES) => {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const stale = await StoreOrder.find({
    kind: "medal",
    paymentStatus: "pending",
    stockReserved: true,
    stockApplied: false,
    createdAt: { $lt: cutoff },
  })
    .select("_id")
    .limit(100)        // ek baar mein itne hi — request dheemi na ho
    .lean();

  let n = 0;
  for (const o of stale) {
    const r = await releaseOrder(o._id, "cancel");
    if (!r.alreadyDone) {
      await StoreOrder.updateOne(
        { _id: o._id },
        {
          $set: { paymentStatus: "cancelled", orderStatus: "cancelled", cancelledAt: new Date() },
          $push: {
            statusHistory: {
              status: "cancelled",
              note: `Payment not completed in ${minutes} minutes`,
              by: "system",
              at: new Date(),
            },
          },
        }
      );
      n++;
    }
  }
  return n;
};

/* ───────────────────────────────────────────────────────────────
   RESERVE MANY — cart ke liye

   ⚠️ Yahan "sab ya kuch nahi" chahiye. Agar cart mein teen medal
   hain aur teesra khatam ho chuka hai, to pehle do ki rok bhi
   hatani padegi — warna wo do medal 20 minute tak bina wajah atke
   rahenge jabki order bana hi nahi.

   Mongo mein kai document par ek saath transaction standalone
   server par nahi chalta, isliye haath se palatte hain: jo rok
   lagayi thi, wahi wapas kholte hain.
─────────────────────────────────────────────────────────────── */
const reserveMany = async (lines) => {
  const held = [];

  for (const line of lines) {
    const r = await reserve(line.productId, line.qty);

    if (!r.ok) {
      // Jo abhi tak roka tha, sab chhod do
      for (const h of held) await release(h.productId, h.qty).catch(() => {});
      return { ok: false, failed: line, reason: r.reason, left: r.left ?? 0 };
    }

    held.push({ productId: line.productId, qty: line.qty, product: r.product });
  }

  return { ok: true, held };
};

module.exports = {
  HOLD_MINUTES,
  reserveMany,
  available,
  reserve,
  release,
  releaseOrder,
  finalise,
  sweepExpired,
};

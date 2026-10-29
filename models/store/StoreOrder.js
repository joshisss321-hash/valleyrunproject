const mongoose = require("mongoose");

/* Order ki line — SNAPSHOT hai, reference nahi.
   Product ka daam ya naam baad mein badla to purana bill nahi badalna
   chahiye. Isliye khareedte waqt ki har cheez yahin copy ho jaati hai. */
const orderItemSchema = new mongoose.Schema(
  {
    product:   { type: mongoose.Schema.Types.ObjectId, ref: "StoreProduct" },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },

    name:      { type: String, required: true },
    variant:   { type: String, default: "" },   // "500 g"
    sku:       { type: String, default: "" },
    image:     { type: String, default: "" },

    qty:       { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    weightGm:  { type: Number, default: 0 },
  },
  { _id: false }
);

/* Pata bhi snapshot — customer baad mein apna address badle to
   bheja ja chuka order wahi purana pata dikhaye. */
const addressSnapshotSchema = new mongoose.Schema(
  {
    name:     { type: String, default: "" },
    phone:    { type: String, default: "" },
    line1:    { type: String, default: "" },
    line2:    { type: String, default: "" },
    landmark: { type: String, default: "" },
    city:     { type: String, default: "" },
    state:    { type: String, default: "" },
    pincode:  { type: String, default: "" },
    country:  { type: String, default: "India" },
  },
  { _id: false }
);

const PAYMENT_STATUS = ["pending", "paid", "failed", "cancelled", "refunded"];
const ORDER_STATUS = [
  "pending_payment", "confirmed", "processing", "packed",
  "shipped", "delivered", "cancelled", "return_requested",
  "returned", "refunded",
];

const storeOrderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true },  // VS-2026-0001

    user:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    name:  { type: String, default: "" },

    address: { type: addressSnapshotSchema, default: () => ({}) },
    items:   { type: [orderItemSchema], default: [] },

    /* ── Paise ka hisaab — sab server par bana, browser se nahi ── */
    subtotal:   { type: Number, required: true, min: 0 },
    couponCode: { type: String, default: "" },
    discount:   { type: Number, default: 0, min: 0 },
    shipping:   { type: Number, default: 0, min: 0 },
    tax:        { type: Number, default: 0, min: 0 },
    total:      { type: Number, required: true, min: 0 },

    paymentMethod: { type: String, default: "razorpay" },     // razorpay | cod
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: "pending" },
    orderStatus:   { type: String, enum: ORDER_STATUS,   default: "pending_payment" },

    razorpayOrderId:   { type: String, default: "", index: true },
    razorpayPaymentId: { type: String, default: "" },

    courier:     { type: String, default: "" },
    trackingId:  { type: String, default: "" },
    trackingUrl: { type: String, default: "" },

    paidAt:      { type: Date, default: null },
    shippedAt:   { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    /* Har badlaav ka record — customer ko timeline dikhta hai aur
       support "mera order kahan hai" ka jawab khud dekh leti hai */
    statusHistory: {
      type: [{
        _id:    false,
        status: { type: String },
        note:   { type: String, default: "" },
        by:     { type: String, default: "" },   // "admin" | "system" | "customer"
        at:     { type: Date, default: Date.now },
      }],
      default: [],
    },

    adminNote:    { type: String, default: "" },
    customerNote: { type: String, default: "" },

    // Stock ghata diya gaya? Do baar na ghate isliye
    stockApplied: { type: Boolean, default: false },
  },
  { timestamps: true }
);

storeOrderSchema.index({ user: 1, createdAt: -1 });
storeOrderSchema.index({ email: 1, createdAt: -1 });
storeOrderSchema.index({ orderStatus: 1, createdAt: -1 });
storeOrderSchema.index({ paymentStatus: 1, createdAt: -1 });

storeOrderSchema.statics.PAYMENT_STATUS = PAYMENT_STATUS;
storeOrderSchema.statics.ORDER_STATUS   = ORDER_STATUS;

module.exports = mongoose.model("StoreOrder", storeOrderSchema);
module.exports.PAYMENT_STATUS = PAYMENT_STATUS;
module.exports.ORDER_STATUS   = ORDER_STATUS;

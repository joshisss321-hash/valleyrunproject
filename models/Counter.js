const mongoose = require("mongoose");

/**
 * Atomic sequence generator — BIB numbers ke liye.
 * findOneAndUpdate + $inc atomic hai, isliye do simultaneous
 * registrations ko kabhi same BIB nahi milega.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "bib:monsoon-run-2026"
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function (key) {
  const doc = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model("Counter", counterSchema);

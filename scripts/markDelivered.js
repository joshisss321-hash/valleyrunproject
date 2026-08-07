/**
 * Purane events ki registrations ko "delivered" mark karta hai.
 *
 * Medal to pahunch chuke hain, par DB mein medalStatus "pending" hi
 * pada hai — kyunki pehle use update karne ka koi zariya nahi tha.
 * Isse user ki profile mein timeline adhoori dikhti hai.
 *
 *   node scripts/markDelivered.js monsoon-run-2026
 *       → sirf batata hai kitne badlenge (kuch save NAHI karta)
 *
 *   node scripts/markDelivered.js monsoon-run-2026 --confirm
 *       → jinki activity approve hui thi, unhe delivered mark karta hai
 *
 *   node scripts/markDelivered.js monsoon-run-2026 --confirm --all
 *       → event ki HAR registration ko delivered mark karta hai
 *         (tab use kijiye jab sabko medal bheja tha, chahe activity
 *          submit ki ho ya nahi)
 */
require("dotenv").config({ path: "./.env" });
const mongoose      = require("mongoose");
const Event         = require("../models/Event");
const Registration  = require("../models/Registration");
const RunSubmission = require("../models/RunSubmission");
require("../models/User"); // populate("user") ise register kiye bina fail ho jata hai

const args      = process.argv.slice(2);
const slug      = args.find((a) => !a.startsWith("--"));
const confirmed = args.includes("--confirm");
const everyone  = args.includes("--all");

const run = async () => {
  try {
    if (!slug) {
      console.log("\nEvent slug do:\n  node scripts/markDelivered.js <event-slug>\n");
      process.exit(1);
    }

    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGO_URI / MONGODB_URI .env mein nahi mila");
    await mongoose.connect(uri);

    const event = await Event.findOne({ slug });
    if (!event) {
      const all = await Event.find().select("slug title").lean();
      console.log(`\n❌ "${slug}" naam ka event nahi mila. Maujood events:\n`);
      all.forEach((e) => console.log(`   ${e.slug}  —  ${e.title}`));
      console.log("");
      process.exit(1);
    }

    const regs = await Registration.find({ event: event._id })
      .populate("user", "name email")
      .lean();

    // Kiski activity approve hui thi
    const approvedEmails = new Set(
      (await RunSubmission.find({ eventSlug: slug, status: "approved" })
        .select("email").lean()).map((s) => s.email)
    );

    const eligible = regs.filter((r) => {
      if (r.medalStatus === "delivered") return false;       // pehle se delivered
      if (everyone) return true;
      return approvedEmails.has(r.user?.email);              // sirf approved wale
    });

    console.log(`\n📦 Event : ${event.title}  (${slug})`);
    console.log(`   Total registrations   : ${regs.length}`);
    console.log(`   Approved activities   : ${approvedEmails.size}`);
    console.log(`   Pehle se delivered    : ${regs.filter((r) => r.medalStatus === "delivered").length}`);
    console.log(`   Ab delivered honge    : ${eligible.length}`);
    console.log(`   Mode                  : ${everyone ? "SAARI registrations" : "sirf approved activity wale"}`);

    if (eligible.length === 0) {
      console.log("\n✅ Kuch badalne ki zaroorat nahi.\n");
      process.exit(0);
    }

    if (!confirmed) {
      console.log("\n⚠️  Ye sirf preview tha — kuch save nahi hua.");
      console.log("   Sach mein karna ho to yahi command --confirm ke saath chalaiye:\n");
      console.log(`   node scripts/markDelivered.js ${slug} --confirm${everyone ? " --all" : ""}\n`);
      process.exit(0);
    }

    const now = new Date();
    const result = await Registration.updateMany(
      { _id: { $in: eligible.map((r) => r._id) } },
      {
        $set:  { medalStatus: "delivered", deliveredAt: now },
        $push: {
          statusHistory: {
            status: "delivered",
            note:   "Purane event ka record theek kiya gaya",
            at:     now,
          },
        },
      }
    );

    console.log(`\n✅ ${result.modifiedCount} registrations delivered mark ho gayin.`);
    console.log("   In sabki profile mein ab poori timeline dikhegi.\n");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

run();

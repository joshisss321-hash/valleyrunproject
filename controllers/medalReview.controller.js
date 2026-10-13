const MedalReview = require("../models/MedalReview");
const ImageKit = require("imagekit");
const sharp = require("sharp");
const fs = require("fs");

/* Pehle ye Cloudinary (dafwe6lci) par upload karta tha. Wo account ab
   delivery par 401 deta hai — yaani purani 38 photos to gayin hi, har
   nayi photo bhi upload hote hi gayab ho jaati thi. Admin panel mein
   runner ki ek bhi medal photo nahi dikhti thi.

   Ab wahi ImageKit account jo baaki poori site use karti hai. */
const imagekit = new ImageKit({
  publicKey:   process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey:  process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const submitMedalReview = async (req, res) => {
  const cleanup = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  };

  try {
    const { name, instaId, review } = req.body;
    const file = req.file;

    if (!name || !instaId || !review || !file) {
      cleanup();
      return res.status(400).json({ error: "All fields are required" });
    }

    // Phone se aayi photo 5-8 MB ki hoti hai — compress karke bhejo
    const fileBuffer = await sharp(file.path)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    const uploaded = await imagekit.upload({
      file:     fileBuffer,
      fileName: `medal_review_${Date.now()}.jpg`,
      folder:   "/valleyrun/medal-reviews",
    });

    cleanup();

    await MedalReview.create({
      name,
      instaId,
      review,
      imageUrl: uploaded.url,
    });

    res.json({ success: true, message: "Review submitted successfully" });

  } catch (err) {
    cleanup();
    console.error("Medal review submit failed:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

module.exports = { submitMedalReview };

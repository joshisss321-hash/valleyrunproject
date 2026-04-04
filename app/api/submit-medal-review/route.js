import connectDB from "@/lib/db";
import MedalReview from "@/models/MedalReview";
import { v2 as cloudinary } from "cloudinary";

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req) {
  try {
    await connectDB();

    const formData = await req.formData();

    const name    = formData.get("name");
    const instaId = formData.get("instaId");
    const review  = formData.get("review");
    const image   = formData.get("image");

    // Validation
    if (!name || !instaId || !review || !image) {
      return Response.json({ error: "All fields are required" }, { status: 400 });
    }

    // Upload image to Cloudinary
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "medal-reviews" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    // Save to DB
    await MedalReview.create({
      name,
      instaId,
      review,
      imageUrl: uploadResult.secure_url,
    });

    return Response.json({
      success: true,
      message: "Review submitted successfully",
    });

  } catch (err) {
    console.log(err);
    return Response.json({ error: "Server Error" }, { status: 500 });
  }
}

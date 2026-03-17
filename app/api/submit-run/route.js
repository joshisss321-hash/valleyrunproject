import connectDB from "@/lib/db";
import RunSubmission from "@/models/RunSubmission";

export async function POST(req) {
  try {
    await connectDB();

    const formData = await req.formData();

    const name = formData.get("name");
    const email = formData.get("email");
    const phone = formData.get("phone");
    const distance = formData.get("distance");

    // duplicate check
    const existing = await RunSubmission.findOne({ email });

    if (existing) {
      return Response.json({
        error: "You already submitted activity"
      }, { status: 400 });
    }

    await RunSubmission.create({
      name,
      email,
      phone,
      distance
    });

    return Response.json({
      success: true,
      message: "Activity submitted successfully"
    });

  } catch (err) {
    console.log(err);
    return Response.json({ error: "Server Error" }, { status: 500 });
  }
}
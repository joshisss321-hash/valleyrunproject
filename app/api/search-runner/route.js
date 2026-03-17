import connectDB from "@/lib/db";
import Registration from "@/models/Registration";

export async function POST(req) {
  try {
    await connectDB();

    const { query } = await req.json();

    const runner = await Registration.findOne({
      $or: [
        { email: query },
        { phone: query }
      ]
    });

    return Response.json({ runner });

  } catch (err) {
    console.log(err);
    return Response.json({ error: "Server Error" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { sendReviewDigest } from "@/lib/review-digest";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const summary = await sendReviewDigest();
  return NextResponse.json(summary);
}

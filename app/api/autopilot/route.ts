import { NextResponse } from "next/server";
import { setAutopilot } from "@/lib/autopilot";
import { getSnapshot } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getSnapshot());
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json(setAutopilot(body));
}

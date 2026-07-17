import { NextResponse } from "next/server";
import { readTargetState } from "@/lib/target";

export async function GET() {
  const { metrics } = await readTargetState();
  return NextResponse.json(metrics);
}

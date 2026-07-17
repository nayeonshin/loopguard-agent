import { NextResponse } from "next/server";
import { readTargetState } from "@/lib/target";

export async function GET() {
  const { metrics } = await readTargetState();

  return NextResponse.json({
    status: metrics.health,
    version: metrics.version,
    expected_content_present: metrics.expected_content_present
  });
}

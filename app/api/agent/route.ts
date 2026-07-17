import { NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent";
import { getSnapshot } from "@/lib/store";
import { readTargetState } from "@/lib/target";

export async function GET() {
  await readTargetState();
  return NextResponse.json(getSnapshot());
}

export async function POST() {
  return NextResponse.json(await runAgentCycle());
}

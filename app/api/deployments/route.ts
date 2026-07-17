import { NextResponse } from "next/server";
import { readTargetState } from "@/lib/target";

export async function GET() {
  const { deployments } = await readTargetState();
  return NextResponse.json(deployments);
}

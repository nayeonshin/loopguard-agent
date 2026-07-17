import { NextResponse } from "next/server";
import { testDeniedDeployCode } from "@/lib/agent";

export async function POST() {
  return NextResponse.json(await testDeniedDeployCode());
}

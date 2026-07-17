import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/store";
import { triggerBrokenDeployment } from "@/lib/target";

export async function POST() {
  await triggerBrokenDeployment();
  return NextResponse.json(getSnapshot());
}

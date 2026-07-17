import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/store";
import { resetTarget } from "@/lib/target";

export async function POST() {
  await resetTarget();
  return NextResponse.json(getSnapshot());
}

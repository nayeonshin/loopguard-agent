import { NextResponse } from "next/server";
import { rollbackTarget } from "@/lib/target";

export async function POST() {
  return NextResponse.json(await rollbackTarget());
}

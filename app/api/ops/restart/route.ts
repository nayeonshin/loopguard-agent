import { NextResponse } from "next/server";
import { restartTarget } from "@/lib/target";

export async function POST() {
  return NextResponse.json(await restartTarget());
}

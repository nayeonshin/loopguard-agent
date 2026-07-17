import { NextResponse } from "next/server";
import { getRuntimeStore } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getRuntimeStore().timeline);
}

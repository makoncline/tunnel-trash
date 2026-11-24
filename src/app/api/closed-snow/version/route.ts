import { NextResponse } from "next/server";
import { currentBuildId } from "@/lib/closed-snow-version";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: currentBuildId() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

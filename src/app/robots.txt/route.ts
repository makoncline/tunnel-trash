import { NextResponse } from "next/server";
import { robotsTxt } from "@/lib/agent-ready";

export function GET() {
  return new NextResponse(robotsTxt(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

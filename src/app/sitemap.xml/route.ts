import { NextResponse } from "next/server";
import { sitemapXml } from "@/lib/agent-ready";

export function GET() {
  return new NextResponse(sitemapXml(), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

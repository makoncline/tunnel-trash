import { NextResponse, type NextRequest } from "next/server";
import { linkHeaderValue, prefersMarkdown } from "@/lib/agent-ready";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname !== "/" && pathname !== "/closed-snow") {
    return NextResponse.next();
  }

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    prefersMarkdown(request.headers.get("accept"))
  ) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/api/agent/markdown";
    rewriteUrl.search = `?path=${encodeURIComponent(pathname)}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  const response = NextResponse.next();
  response.headers.set("Link", linkHeaderValue(pathname));
  response.headers.append("Vary", "Accept");
  return response;
}

export const config = {
  matcher: ["/", "/closed-snow"],
};

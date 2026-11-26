import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { WebMcpTools } from "@/components/WebMcpTools";
import { AGENT_PATHS, SITE_ORIGIN } from "@/lib/agent-ready";

export const metadata: Metadata = {
  title: "Tunnel Trash",
  description: "Tunnel Trash - Eisenhower Tee",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
  },
  other: {
    "agent:instructions":
      "Use this search API to find live Colorado ski conditions, 7-day snow forecasts, drive times, road alerts, and Tunnel Trash details with keywords or natural-language queries. Results are returned in Markdown.",
    "agent:endpoint": `${SITE_ORIGIN}${AGENT_PATHS.search}?q={query}`,
    "agent:method": "GET",
    "agent:documentation":
      "https://developers.cloudflare.com/ai-search/how-to/search-for-agents/",
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <head>
        <link rel="ai-catalog" href={AGENT_PATHS.aiCatalog} />
        <link rel="api-catalog" href={AGENT_PATHS.apiCatalog} />
      </head>
      <body>
        <WebMcpTools />
        {children}
      </body>
    </html>
  );
}

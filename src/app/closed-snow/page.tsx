import type { Metadata, Viewport } from "next";
import { loadConditions, loadFeed } from "@/lib/closed-snow";
import { loadBrief } from "@/lib/closed-snow-brief";
import { loadRoads } from "@/lib/closed-snow-roads";
import { loadSkiDayWeather } from "@/lib/closed-snow-weather";
import { SnowCameras } from "./snow-cameras";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.tunnel-trash.com"),
  title: "Closed Snow · Tunnel Trash",
  description: "Where to ski today: snow stakes, reported snow and base depth.",
  manifest: "/closed-snow.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Closed Snow",
  },
  icons: {
    apple: [
      { url: "/closed-snow-apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    icon: [
      { url: "/closed-snow-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/closed-snow-favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/closed-snow-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Closed Snow · Tunnel Trash",
    description: "Where to ski today: snow stakes, reported snow and base depth.",
    url: "/closed-snow",
    siteName: "Tunnel Trash",
    type: "website",
    images: [
      {
        url: "/closed-snow-og.png",
        width: 1200,
        height: 630,
        alt: "Closed Snow — Colorado snow stakes and live lifts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Closed Snow · Tunnel Trash",
    description: "Where to ski today: snow stakes, reported snow and base depth.",
    images: ["/closed-snow-og.png"],
  },
};

export const revalidate = 60;

export const viewport: Viewport = {
  themeColor: "#111516",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default async function ClosedSnowPage() {
  const isr = { revalidate: 60 };
  const [current, morning, conditions, brief, weather, roads] = await Promise.all([
    loadFeed("current", fetch, isr),
    loadFeed("morning", fetch, isr),
    loadConditions(fetch, Date.now, isr),
    loadBrief(fetch, isr),
    loadSkiDayWeather(),
    loadRoads(fetch, isr),
  ]);
  const shirtPrice = process.env.NEXT_PUBLIC_EISENHOWER_PRICE ?? "32";
  return (
    <SnowCameras
      current={current}
      morning={morning}
      conditions={conditions}
      asOf={current.checkedAt}
      brief={brief}
      weather={weather}
      roads={roads}
      shirtPrice={shirtPrice}
    />
  );
}

import type { Metadata, Viewport } from "next";
import { loadConditions, loadFeed } from "@/lib/closed-snow";
import { loadBrief } from "@/lib/closed-snow-brief";
import { loadSkiDayWeather } from "@/lib/closed-snow-weather";
import { SnowCameras } from "./snow-cameras";

export const metadata: Metadata = {
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
      { url: "/closed-snow-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#111516",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default async function ClosedSnowPage() {
  const [current, morning, conditions, brief, weather] = await Promise.all([
    loadFeed("current"),
    loadFeed("morning"),
    loadConditions(),
    loadBrief(),
    loadSkiDayWeather(),
  ]);
  return (
    <SnowCameras
      current={current}
      morning={morning}
      conditions={conditions}
      asOf={current.checkedAt}
      brief={brief}
      weather={weather}
    />
  );
}

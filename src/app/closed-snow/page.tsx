import type { Metadata } from "next";
import { loadFeed } from "@/lib/closed-snow";
import { SnowCameras } from "./snow-cameras";

export const metadata: Metadata = {
  title: "Closed Snow · Tunnel Trash",
  description: "Current and morning snow camera images and clips.",
  robots: { index: false, follow: false },
};

export default async function ClosedSnowPage() {
  const [current, morning] = await Promise.all([
    loadFeed("current"),
    loadFeed("morning"),
  ]);
  return <SnowCameras current={current} morning={morning} asOf={current.checkedAt} />;
}

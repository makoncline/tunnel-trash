import type { Metadata } from "next";
import { loadConditions, loadFeed } from "@/lib/closed-snow";
import { SnowCameras } from "./snow-cameras";

export const metadata: Metadata = {
  title: "Closed Snow · Tunnel Trash",
  description: "Where to ski today: snow stakes, reported snow and base depth.",
  robots: { index: false, follow: false },
};

export default async function ClosedSnowPage() {
  const [current, morning, conditions] = await Promise.all([
    loadFeed("current"),
    loadFeed("morning"),
    loadConditions(),
  ]);
  return (
    <SnowCameras
      current={current}
      morning={morning}
      conditions={conditions}
      asOf={current.checkedAt}
    />
  );
}

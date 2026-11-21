import type { Metadata } from "next";
import { loadConditions, loadFeed } from "@/lib/closed-snow";
import { loadBrief } from "@/lib/closed-snow-brief";
import { SnowCameras } from "./snow-cameras";
import { PrivateForecast } from "./weathernext-timeline";

export const metadata: Metadata = {
  title: "Closed Snow · Tunnel Trash",
  description: "Where to ski today: snow stakes, reported snow and base depth.",
  robots: { index: false, follow: false },
};

export default async function ClosedSnowPage() {
  const [current, morning, conditions, brief] = await Promise.all([
    loadFeed("current"),
    loadFeed("morning"),
    loadConditions(),
    loadBrief(),
  ]);
  return (
    <SnowCameras
      current={current}
      morning={morning}
      conditions={conditions}
      asOf={current.checkedAt}
      brief={brief}
      afterBrief={<PrivateForecast />}
    />
  );
}

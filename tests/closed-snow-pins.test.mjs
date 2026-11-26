import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePinnedFirst,
  normalizePinnedResorts,
  orderOutlookRegions,
  pinnedOutlookRegionIds,
  togglePinnedResort,
} from "../src/lib/closed-snow-pins.ts";

test("togglePinnedResort pins in order, deduplicates, and unpins cleanly", () => {
  assert.deepEqual(togglePinnedResort([], "eldora"), ["eldora"]);
  assert.deepEqual(togglePinnedResort(["eldora"], "vail"), ["eldora", "vail"]);
  assert.deepEqual(togglePinnedResort(["eldora", "vail"], "eldora"), ["vail"]);
  assert.deepEqual(normalizePinnedResorts([" vail ", "vail", "", "copper"]), [
    "vail",
    "copper",
  ]);
});

test("comparePinnedFirst keeps pinned resorts ahead of unpinned in pin order", () => {
  const pinned = ["steamboat", "eldora"];
  const items = ["vail", "eldora", "keystone", "steamboat"];
  const sorted = [...items].sort(
    (a, b) => comparePinnedFirst(a, b, pinned) || a.localeCompare(b),
  );
  assert.deepEqual(sorted, ["steamboat", "eldora", "keystone", "vail"]);
});

test("orderOutlookRegions moves pinned resort regions first in pin order and deduplicates shared regions", () => {
  const regions = [
    { id: "summit", label: "Summit/WP", snowfall: "5–7″" },
    { id: "vail", label: "Vail", snowfall: "7–9″" },
    { id: "steamboat", label: "Steamboat", snowfall: "11″", lead: true },
    { id: "eldora", label: "Eldora", snowfall: "3″" },
  ];

  // Unpinned preserves original order and sets pinned: false
  assert.deepEqual(
    orderOutlookRegions(regions, []).map((r) => [r.id, r.pinned]),
    [
      ["summit", false],
      ["vail", false],
      ["steamboat", false],
      ["eldora", false],
    ],
  );

  // Pinning Eldora then Copper + Winter Park (both in summit) moves Eldora first, Summit/WP second (once)
  assert.deepEqual(pinnedOutlookRegionIds(["eldora", "copper", "winter-park"]), [
    "eldora",
    "summit",
  ]);
  assert.deepEqual(
    orderOutlookRegions(regions, ["eldora", "copper", "winter-park"]).map((r) => [
      r.id,
      r.pinned,
    ]),
    [
      ["eldora", true],
      ["summit", true],
      ["vail", false],
      ["steamboat", false],
    ],
  );

  // Event that does not contain the pinned region still returns cleanly
  const singleRegion = [{ id: "steamboat", label: "Steamboat", snowfall: "1″" }];
  assert.deepEqual(
    orderOutlookRegions(singleRegion, ["eldora"]).map((r) => [r.id, r.pinned]),
    [["steamboat", false]],
  );
});

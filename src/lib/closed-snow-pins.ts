export const RESORT_OUTLOOK_REGION: Record<string, string> = {
  "arapahoe-basin": "summit",
  breckenridge: "summit",
  copper: "summit",
  keystone: "summit",
  loveland: "summit",
  "winter-park": "summit",
  vail: "vail",
  "beaver-creek": "vail",
  steamboat: "steamboat",
  eldora: "eldora",
};

export function normalizePinnedResorts(pinned: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of pinned) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function togglePinnedResort(
  pinned: readonly string[],
  resortId: string,
): string[] {
  const normalized = normalizePinnedResorts(pinned);
  if (normalized.includes(resortId)) {
    return normalized.filter((id) => id !== resortId);
  }
  return [...normalized, resortId];
}

export function comparePinnedFirst(
  aId: string,
  bId: string,
  pinnedResorts: readonly string[],
): number {
  const aIndex = pinnedResorts.indexOf(aId);
  const bIndex = pinnedResorts.indexOf(bId);
  if (aIndex === -1 && bIndex === -1) return 0;
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

export function pinnedOutlookRegionIds(
  pinnedResorts: readonly string[],
): string[] {
  const seen = new Set<string>();
  const regionIds: string[] = [];
  for (const resortId of pinnedResorts) {
    const regionId = RESORT_OUTLOOK_REGION[resortId];
    if (!regionId || seen.has(regionId)) continue;
    seen.add(regionId);
    regionIds.push(regionId);
  }
  return regionIds;
}

export function orderOutlookRegions<T extends { id: string }>(
  regions: readonly T[],
  pinnedResorts: readonly string[],
): Array<T & { pinned: boolean }> {
  const pinnedRegions = pinnedOutlookRegionIds(pinnedResorts);
  if (pinnedRegions.length === 0) {
    return regions.map((region) => ({ ...region, pinned: false }));
  }
  const pinnedItems: Array<T & { pinned: boolean }> = [];
  const remainingItems: Array<T & { pinned: boolean }> = [];
  const byId = new Map(regions.map((region) => [region.id, region]));
  const placed = new Set<string>();

  for (const regionId of pinnedRegions) {
    const match = byId.get(regionId);
    if (!match) continue;
    pinnedItems.push({ ...match, pinned: true });
    placed.add(regionId);
  }

  for (const region of regions) {
    if (placed.has(region.id)) continue;
    remainingItems.push({ ...region, pinned: false });
  }

  return [...pinnedItems, ...remainingItems];
}

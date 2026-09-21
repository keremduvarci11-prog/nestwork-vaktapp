const canonicalRegions = [
  "Bergen", "Os", "Fusa", "Stord", "Haugesund", "Stavanger", "Bryne",
  "Kristiansand", "Arendal", "Drammen", "Oslo", "Lørenskog", "Fredrikstad", "Trondheim",
];
const regionNames = new Map(canonicalRegions.map(region => [region.toLowerCase(), region]));
regionNames.set("os øyro", "Os");
regionNames.set("osøyro", "Os");

/** A slash separates memberships; spaces inside a place name are retained. */
export function parseRegions(value: string): string[] {
  const result = new Map<string, string>();
  for (const part of value.split(/[/,;]/)) {
    const trimmed = part.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const region = regionNames.get(trimmed.toLowerCase()) ?? trimmed;
    result.set(region.toLowerCase(), region);
  }
  return Array.from(result.values());
}

export function normalizeRegionMembership(value: string): string {
  return parseRegions(value).join("/");
}

export function matchesRegions(value: string, requested: readonly string[]): boolean {
  const wanted = new Set(requested.flatMap(parseRegions).map(region => region.toLowerCase()));
  return parseRegions(value).some(region => wanted.has(region.toLowerCase()));
}

// Preserve the existing, intentionally different visibility and notification groups.
const visibleGroups: Record<string, string[]> = {
  Bergen: ["Bergen", "Os"],
  Os: ["Os"],
  Haugesund: ["Haugesund", "Stord"],
  Stord: ["Haugesund", "Stord"],
};
const notificationGroups: Record<string, string[]> = {
  ...visibleGroups,
  Os: ["Bergen", "Os"],
};

export function visibleShiftRegions(value: string): string[] {
  return Array.from(new Set(parseRegions(value).flatMap(region => visibleGroups[region] ?? [region])));
}

export function notificationRegions(value: string): string[] {
  return Array.from(new Set(parseRegions(value).flatMap(region => notificationGroups[region] ?? [region])));
}
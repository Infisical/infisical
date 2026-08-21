export type OverviewSearchState = {
  secretPath?: string;
  environments?: string[];
  search?: string;
  tags?: string;
  filterBy?: string;
};

export const serializeOverviewTags = (tags: string[]) => {
  const serialized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort().join(",");
  return serialized || undefined;
};

export const serializeOverviewResourceFilter = (
  filter: Record<string, boolean>,
  resourceTypes: string[]
) => {
  const serialized = resourceTypes.filter((resourceType) => filter[resourceType]).join(",");
  return serialized || undefined;
};

export const normalizeOverviewEnvironments = (
  requestedSlugs: string[],
  availableSlugs: string[]
) => {
  const available = new Set(availableSlugs);
  const normalized = availableSlugs.filter(
    (slug) => requestedSlugs.includes(slug) && available.has(slug)
  );
  return [...new Set(normalized)];
};

export const updateOverviewSecretPath = <T extends OverviewSearchState>(
  search: T,
  secretPath: string
): T => ({ ...search, secretPath });

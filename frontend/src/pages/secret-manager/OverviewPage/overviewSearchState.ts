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

export const resolveOverviewEnvironmentSlugs = (
  requestedSlugs: string[],
  storedIds: string[],
  availableEnvironments: { id: string; slug: string }[]
) => {
  const requestedEnvironments = normalizeOverviewEnvironments(
    requestedSlugs,
    availableEnvironments.map(({ slug }) => slug)
  );

  if (requestedEnvironments.length > 0) return requestedEnvironments;

  return availableEnvironments.filter(({ id }) => storedIds.includes(id)).map(({ slug }) => slug);
};

type OverviewLocation = {
  pathname: string;
  search: unknown;
};

export const hasOverviewScopeChanged = (current: OverviewLocation, next: OverviewLocation) => {
  if (current.pathname !== next.pathname) return true;

  const currentSearch = current.search as OverviewSearchState;
  const nextSearch = next.search as OverviewSearchState;

  return (
    currentSearch.secretPath !== nextSearch.secretPath ||
    (currentSearch.environments ?? []).join(",") !== (nextSearch.environments ?? []).join(",")
  );
};

export const updateOverviewSecretPath = <T extends OverviewSearchState>(
  search: T,
  secretPath: string
): T => ({ ...search, secretPath });

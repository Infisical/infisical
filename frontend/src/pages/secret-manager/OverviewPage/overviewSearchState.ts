export type OverviewSearchState = {
  secretPath?: string;
  environments?: string[];
  search?: string;
  clearSearch?: boolean;
  tags?: string;
  filterBy?: string;
};

export const parseOverviewTags = (tags?: string) =>
  (tags ?? "").split(",").reduce<Record<string, boolean>>((acc, tag) => {
    const tagSlug = tag.trim();
    if (tagSlug) acc[tagSlug] = true;
    return acc;
  }, {});

export const hasSensitiveOverviewSearchState = (search: OverviewSearchState) =>
  Boolean(search.search) || search.tags !== undefined;

export const stripSensitiveOverviewSearchState = <T extends OverviewSearchState>(search: T): T => ({
  ...search,
  search: undefined,
  tags: undefined
});

export const hasOneShotOverviewSearchState = (search: OverviewSearchState) =>
  hasSensitiveOverviewSearchState(search) || Boolean(search.clearSearch);

export const stripOneShotOverviewSearchState = <T extends OverviewSearchState>(search: T): T => ({
  ...stripSensitiveOverviewSearchState(search),
  clearSearch: undefined
});

export const resolveOverviewSearchFilter = (
  currentSearch: string,
  search: Pick<OverviewSearchState, "search" | "clearSearch">
) => {
  if (search.clearSearch) return "";
  return search.search || currentSearch;
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

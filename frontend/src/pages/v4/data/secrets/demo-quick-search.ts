import type {
  TDashboardProjectSecretsQuickSearch,
  TGetDashboardProjectSecretsQuickSearchDTO,
  TSearchSecretsByMetadataDTO,
  TSearchSecretsByMetadataResponse
} from "@app/hooks/api/dashboard/types";
import { SecretMetadataSearchLogicalOperator } from "@app/hooks/api/dashboard/types";

import type { SecretsQuickSearchAdapter } from "./contract-quick-search";
import { childPath, sanitize, secretAt, useStore, within } from "./demo-store";
import type { SecretsFixtures } from "./fixtures";

const SEARCH_LIMIT = 1000;
const METADATA_SEARCH_LIMIT = 100;

const inFolder = (path: string, folder: string) => folder === "/" || within(path, folder);

const enabledTags = (tags: Record<string, boolean>) =>
  Object.entries(tags)
    .filter(([, enabled]) => enabled)
    .map(([slug]) => slug);

const grouped = <T>(items: T[], key: (item: T) => string) =>
  items.reduce<Record<string, T[]>>((groups, item) => {
    const name = key(item);
    return { ...groups, [name]: [...(groups[name] ?? []), item] };
  }, {});

const quickSearchOf = (
  state: SecretsFixtures,
  dto: TGetDashboardProjectSecretsQuickSearchDTO
): TDashboardProjectSecretsQuickSearch => {
  const needle = dto.search.trim().toLowerCase();
  const tags = enabledTags(dto.tags);
  const environments =
    state.projects.find((project) => project.id === dto.projectId)?.environments ?? [];
  const inScope = (projectId: string, environment: string, path: string) =>
    projectId === dto.projectId &&
    dto.environments.includes(environment) &&
    inFolder(path, dto.secretPath);
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);
  const offset = dto.offset ?? 0;
  const page = <T>(items: T[]) => items.slice(offset, offset + (dto.limit ?? items.length));

  const folders = tags.length
    ? []
    : state.folders
        .filter(
          (folder) =>
            inScope(folder.projectId, folder.environment, childPath(folder.path, folder.name)) &&
            matches(folder.name)
        )
        .map(({ projectId: _project, environment, path, ...folder }) => ({
          ...folder,
          envId: environments.find((entry) => entry.slug === environment)?.id ?? environment,
          path: childPath(path, folder.name)
        }));
  const secrets = state.secrets
    .filter(
      (secret) =>
        inScope(secret.projectId, secret.env, secret.path) &&
        (!tags.length || secret.tags?.some((tag) => tags.includes(tag.slug))) &&
        (matches(secret.key) ||
          Boolean(secret.tags?.some((tag) => matches(tag.slug))) ||
          Boolean(
            needle &&
            secret.secretMetadata?.some((entry) => matches(entry.key) || matches(entry.value))
          ))
    )
    .map(sanitize);
  const dynamicSecrets = tags.length
    ? []
    : state.dynamicSecrets.filter(
        (entry) => inScope(entry.projectId, entry.environment, entry.path) && matches(entry.name)
      );
  const secretRotations = tags.length
    ? []
    : state.rotations.filter(
        (entry) =>
          inScope(entry.projectId, entry.environment.slug, entry.folder.path) && matches(entry.name)
      );
  return {
    totalFolderCount: folders.length,
    totalSecretCount: secrets.length,
    totalDynamicSecretCount: dynamicSecrets.length,
    totalSecretRotationCount: secretRotations.length,
    totalCount: folders.length + secrets.length + dynamicSecrets.length + secretRotations.length,
    searchLimit: SEARCH_LIMIT,
    isSearchLimitReached: false,
    folders: grouped(page(folders), (folder) => folder.path),
    secrets: grouped(page(secrets), (secret) => childPath(secret.path ?? "/", secret.key)),
    dynamicSecrets: grouped(page(dynamicSecrets), (entry) => childPath(entry.path, entry.name)),
    secretRotations: grouped(page(secretRotations), (entry) =>
      childPath(entry.folder.path, entry.name)
    )
  };
};

const metadataSearchOf = (
  state: SecretsFixtures,
  dto: TSearchSecretsByMetadataDTO
): TSearchSecretsByMetadataResponse => {
  const tags = enabledTags(dto.tags);
  const secrets = state.secrets.filter((secret) => {
    if (secret.projectId !== dto.projectId) return false;
    if (dto.environments?.length && !dto.environments.includes(secret.env)) return false;
    if (dto.secretPath && !inFolder(secret.path, dto.secretPath)) return false;
    if (tags.length && !secret.tags?.some((tag) => tags.includes(tag.slug))) return false;
    const hits = dto.filters.map((filter) =>
      Boolean(
        secret.secretMetadata?.some(
          (entry) => entry.key === filter.key && entry.value === filter.value
        )
      )
    );
    return dto.operator === SecretMetadataSearchLogicalOperator.And
      ? hits.every(Boolean)
      : hits.some(Boolean);
  });
  return {
    searchLimit: METADATA_SEARCH_LIMIT,
    secrets: secrets.slice(0, METADATA_SEARCH_LIMIT).map((secret) => ({
      secretId: secret.id,
      secretKey: secret.key,
      environment: secret.env,
      secretPath: secret.path,
      metadata: (secret.secretMetadata ?? []).map(({ key, value }) => ({ key, value })),
      tags: (secret.tags ?? []).map(({ id, slug }) => ({ id, slug })),
      secretValueHidden: secret.secretValueHidden
    }))
  };
};

const idle = { data: undefined, isPending: true, isFetching: false, error: null };

export const secretsQuickSearchDemo: SecretsQuickSearchAdapter = {
  useQuickSearch: (dto, options) => {
    const state = useStore().use();
    const enabled =
      (options?.enabled ?? true) &&
      Boolean(dto.search.trim() || enabledTags(dto.tags).length) &&
      dto.environments.length > 0;
    if (!enabled) return idle;
    return { data: quickSearchOf(state, dto), isPending: false, isFetching: false, error: null };
  },
  useMetadataSearch: (dto, options) => {
    const state = useStore().use();
    if (!(options?.enabled ?? true) || !dto.filters.length) return idle;
    return { data: metadataSearchOf(state, dto), isPending: false, isFetching: false, error: null };
  },
  useReadSecretValue: () => {
    const store = useStore();
    return async (dto) => {
      const secret = store
        .get()
        .secrets.find(secretAt(dto.projectId, dto.environment, dto.secretPath, dto.secretKey));
      if (!secret) throw new Error("This secret no longer exists.");
      return { value: secret.value ?? "", valueOverride: undefined };
    };
  }
};

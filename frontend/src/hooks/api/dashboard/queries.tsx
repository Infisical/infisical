import { useCallback } from "react";
import { useQueries, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { apiRequest } from "@app/config/request";
import {
  DashboardProjectSecretsByKeys,
  DashboardProjectSecretsDetails,
  DashboardProjectSecretsDetailsResponse,
  DashboardProjectSecretsOverview,
  DashboardProjectSecretsOverviewResponse,
  DashboardSecretsOrderBy,
  DashboardSecretValue,
  FolderMoveBlockingType,
  FolderMoveEligibilityResponse,
  TDashboardProjectSecretsQuickSearch,
  TDashboardProjectSecretsQuickSearchResponse,
  TFolderMoveDestinationCheck,
  TGetAccessibleSecretsDTO,
  TGetDashboardProjectSecretsByKeys,
  TGetDashboardProjectSecretsDetailsDTO,
  TGetDashboardProjectSecretsOverviewDTO,
  TGetDashboardProjectSecretsQuickSearchDTO,
  TGetSecretMetadataDTO,
  TGetSecretValueDTO,
  TSearchSecretsByMetadataDTO,
  TSearchSecretsByMetadataResponse,
  TSecretMetadataPage
} from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { mergePersonalSecrets } from "@app/hooks/api/secrets/queries";
import { groupBy, unique } from "@app/lib/fn/array";

import { SecretType, SecretV3Raw } from "../types";

export const dashboardKeys = {
  all: () => ["dashboard"] as const,
  getDashboardSecrets: ({
    projectId,
    secretPath
  }: Pick<TGetDashboardProjectSecretsDetailsDTO, "projectId" | "secretPath">) =>
    [...dashboardKeys.all(), { projectId, secretPath }] as const,
  getProjectSecretsOverview: ({
    projectId,
    secretPath,
    ...params
  }: TGetDashboardProjectSecretsOverviewDTO) =>
    [
      ...dashboardKeys.getDashboardSecrets({ projectId, secretPath }),
      "secrets-overview",
      params
    ] as const,
  getProjectSecretsDetails: ({
    projectId,
    secretPath,
    environment,
    ...params
  }: TGetDashboardProjectSecretsDetailsDTO) =>
    [
      ...dashboardKeys.getDashboardSecrets({ projectId, secretPath }),
      "secrets-details",
      environment,
      params
    ] as const,
  getProjectSecretsQuickSearch: ({
    projectId,
    secretPath,
    ...params
  }: TGetDashboardProjectSecretsQuickSearchDTO) =>
    [
      ...dashboardKeys.getDashboardSecrets({ projectId, secretPath }),
      "quick-search",
      params
    ] as const,
  searchSecretsByMetadata: ({ projectId, ...params }: TSearchSecretsByMetadataDTO) =>
    [...dashboardKeys.all(), "secrets-by-metadata", projectId, params] as const,
  getAccessibleSecrets: ({
    projectId,
    secretPath,
    environment,
    filterByAction
  }: TGetAccessibleSecretsDTO) =>
    [
      ...dashboardKeys.all(),
      "accessible-secrets",
      { projectId, secretPath, environment, filterByAction }
    ] as const,
  getSecretValuesRoot: () => [...dashboardKeys.all(), "secrets-values"] as const,
  getSecretValue: ({
    projectId,
    environment,
    secretPath,
    secretKey,
    isOverride
  }: TGetSecretValueDTO) =>
    [
      ...dashboardKeys.getSecretValuesRoot(),
      projectId,
      environment,
      secretPath,
      secretKey,
      isOverride
    ] as const,
  getFolderMoveEligibility: (folderId: string) =>
    [...dashboardKeys.all(), "folder-move-eligibility", folderId] as const,
  getFolderMoveDestinationEligibility: ({
    folderId,
    destinationEnvironment,
    destinationPath
  }: TFolderMoveDestinationCheck) =>
    [
      ...dashboardKeys.all(),
      "folder-move-destination-eligibility",
      folderId,
      destinationEnvironment,
      destinationPath
    ] as const
};

export const fetchSecretMetadata = async (params: TGetSecretMetadataDTO, signal?: AbortSignal) => {
  const { data } = await apiRequest.get<TSecretMetadataPage>(
    "/api/v1/dashboard/accessible-secrets/metadata",
    { params, signal }
  );
  return data;
};

export const fetchProjectSecretsOverview = async ({
  environments,
  tags,
  ...params
}: TGetDashboardProjectSecretsOverviewDTO) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsOverviewResponse>(
    "/api/v1/dashboard/secrets-overview",
    {
      params: {
        ...params,
        environments: encodeURIComponent(environments.join(",")),
        tags: encodeURIComponent(
          Object.entries(tags ?? {})
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_, enabled]) => enabled)
            .map(([tag]) => tag)
            .join(",")
        )
      }
    }
  );

  return data;
};

export const fetchProjectSecretsDetails = async ({
  tags,
  ...params
}: TGetDashboardProjectSecretsDetailsDTO) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsDetailsResponse>(
    "/api/v1/dashboard/secrets-details",
    {
      params: {
        ...params,
        tags: encodeURIComponent(
          Object.entries(tags)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_, enabled]) => enabled)
            .map(([tag]) => tag)
            .join(",")
        )
      }
    }
  );

  return data;
};

// Keys travel in the querystring and Node rejects a request whose request line and headers exceed
// 16KB, so a long key list is split across requests that each stay well under it. The joined keys
// are encoded here and again by axios, so each key is measured in that double-encoded form.
const SECRETS_BY_KEYS_MAX_ENCODED_LENGTH = 6_000;

const chunkKeysByEncodedLength = (keys: string[]) => {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  let chunkLength = 0;

  keys.forEach((key) => {
    const keyLength = encodeURIComponent(encodeURIComponent(`${key},`)).length;
    if (chunk.length && chunkLength + keyLength > SECRETS_BY_KEYS_MAX_ENCODED_LENGTH) {
      chunks.push(chunk);
      chunk = [];
      chunkLength = 0;
    }
    chunk.push(key);
    chunkLength += keyLength;
  });

  if (chunk.length) chunks.push(chunk);

  return chunks;
};

export const fetchDashboardProjectSecretsByKeys = async ({
  keys,
  ...params
}: TGetDashboardProjectSecretsByKeys): Promise<DashboardProjectSecretsByKeys> => {
  const responses = await Promise.all(
    chunkKeysByEncodedLength(keys).map(async (keyChunk) => {
      const { data } = await apiRequest.get<DashboardProjectSecretsByKeys>(
        "/api/v1/dashboard/secrets-by-keys",
        {
          params: {
            ...params,
            keys: encodeURIComponent(keyChunk.join(","))
          }
        }
      );

      return data;
    })
  );

  return { secrets: responses.flatMap(({ secrets }) => secrets) };
};

const mergePersonalRotationSecrets = (secrets: (SecretV3Raw | null)[]) => {
  const actualSecrets: SecretV3Raw[] = [];
  const dummySecrets: null[] = [];

  secrets.forEach((secret) => {
    if (secret !== null) {
      actualSecrets.push(secret);
    } else {
      dummySecrets.push(secret);
    }
  });

  return [...mergePersonalSecrets(actualSecrets), ...dummySecrets];
};

export const useGetProjectSecretsOverview = (
  {
    projectId,
    secretPath,
    offset = 0,
    limit = 100,
    orderBy = DashboardSecretsOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    sortEnvironment,
    search = "",
    tags,
    includeSecrets,
    includeFolders,
    includeImports,
    includeDynamicSecrets,
    includeSecretRotations,
    includeHoneyTokens,
    includeProxiedServices,
    environments
  }: TGetDashboardProjectSecretsOverviewDTO,
  options?: Omit<
    UseQueryOptions<
      DashboardProjectSecretsOverviewResponse,
      unknown,
      DashboardProjectSecretsOverview,
      ReturnType<typeof dashboardKeys.getProjectSecretsOverview>
    >,
    "queryKey" | "queryFn"
  >
) => {
  const queryClient = useQueryClient();

  return useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(projectId) && (options?.enabled ?? true) && Boolean(environments.length),
    queryKey: dashboardKeys.getProjectSecretsOverview({
      secretPath,
      search,
      tags,
      limit,
      orderBy,
      orderDirection,
      sortEnvironment,
      offset,
      projectId,
      includeSecrets,
      includeFolders,
      includeImports,
      includeDynamicSecrets,
      includeSecretRotations,
      includeHoneyTokens,
      includeProxiedServices,
      environments
    }),
    queryFn: async () => {
      const resp = fetchProjectSecretsOverview({
        secretPath,
        search,
        tags,
        limit,
        orderBy,
        orderDirection,
        sortEnvironment,
        offset,
        projectId,
        includeSecrets,
        includeFolders,
        includeImports,
        includeDynamicSecrets,
        includeSecretRotations,
        includeHoneyTokens,
        includeProxiedServices,
        environments
      });

      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getSecretValuesRoot()
      });

      return resp;
    },
    select: useCallback((data: Awaited<ReturnType<typeof fetchProjectSecretsOverview>>) => {
      const { secrets, secretRotations, honeyTokens, ...select } = data;
      const uniqueSecrets = secrets ? unique(secrets, (i) => i.secretKey) : [];

      const uniqueFolders = select.folders ? unique(select.folders, (i) => i.name) : [];

      const uniqueDynamicSecrets = select.dynamicSecrets
        ? unique(select.dynamicSecrets, (i) => i.name)
        : [];

      const uniqueSecretImports = select.imports ? unique(select.imports, (i) => i.id) : [];
      const uniqueSecretRotations = secretRotations ? unique(secretRotations, (i) => i.name) : [];
      const uniqueHoneyTokens = honeyTokens ? unique(honeyTokens, (i) => i.name) : [];
      const uniqueProxiedServices = select.proxiedServices
        ? unique(select.proxiedServices, (i) => i.name)
        : [];

      return {
        ...select,
        secrets: secrets ? mergePersonalSecrets(secrets) : undefined,
        secretRotations: secretRotations?.map((rotation) => {
          return {
            ...rotation,
            secrets: mergePersonalRotationSecrets(rotation.secrets)
          };
        }),
        honeyTokens,
        totalUniqueSecretsInPage: uniqueSecrets.length,
        totalUniqueDynamicSecretsInPage: uniqueDynamicSecrets.length,
        totalUniqueFoldersInPage: uniqueFolders.length,
        totalUniqueSecretImportsInPage: uniqueSecretImports.length,
        totalUniqueSecretRotationsInPage: uniqueSecretRotations.length,
        totalUniqueHoneyTokensInPage: uniqueHoneyTokens.length,
        totalUniqueProxiedServicesInPage: uniqueProxiedServices.length
      };
    }, []),
    placeholderData: (previousData) => previousData
  });
};

export const useGetProjectSecretsDetails = (
  {
    projectId,
    secretPath,
    environment,
    offset = 0,
    limit = 100,
    orderBy = DashboardSecretsOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = "",
    includeSecrets,
    includeFolders,
    includeImports,
    includeDynamicSecrets,
    includeSecretRotations,
    includeHoneyTokens,
    includeProxiedServices,
    tags
  }: TGetDashboardProjectSecretsDetailsDTO,
  options?: Omit<
    UseQueryOptions<
      DashboardProjectSecretsDetailsResponse,
      unknown,
      DashboardProjectSecretsDetails,
      ReturnType<typeof dashboardKeys.getProjectSecretsDetails>
    >,
    "queryKey" | "queryFn"
  >
) => {
  const queryClient = useQueryClient();

  return useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    retry: (count, error) => {
      // don't retry 404s
      if (error instanceof AxiosError && error.status === 404) return false;

      return count <= 5;
    },
    queryKey: dashboardKeys.getProjectSecretsDetails({
      secretPath,
      search,
      limit,
      orderBy,
      orderDirection,
      offset,
      projectId,
      environment,
      includeSecrets,
      includeFolders,
      includeImports,
      includeDynamicSecrets,
      includeSecretRotations,
      includeHoneyTokens,
      includeProxiedServices,
      tags
    }),
    queryFn: async () => {
      const resp = await fetchProjectSecretsDetails({
        secretPath,
        search,
        limit,
        orderBy,
        orderDirection,
        offset,
        projectId,
        environment,
        includeSecrets,
        includeFolders,
        includeImports,
        includeDynamicSecrets,
        includeSecretRotations,
        includeHoneyTokens,
        includeProxiedServices,
        tags
      });

      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getSecretValuesRoot()
      });

      return resp;
    },
    select: useCallback(
      (data: Awaited<ReturnType<typeof fetchProjectSecretsDetails>>) => ({
        ...data,
        secrets: data.secrets ? mergePersonalSecrets(data.secrets) : undefined,
        secretRotations: data.secretRotations?.map((rotation) => ({
          ...rotation,
          secrets: mergePersonalRotationSecrets(rotation.secrets)
        }))
      }),
      []
    ),
    placeholderData: (previousData) => previousData
  });
};

export const fetchProjectSecretsQuickSearch = async ({
  environments,
  tags,
  ...params
}: TGetDashboardProjectSecretsQuickSearchDTO) => {
  const { data } = await apiRequest.get<TDashboardProjectSecretsQuickSearchResponse>(
    "/api/v1/dashboard/secrets-deep-search",
    {
      params: {
        ...params,
        environments: encodeURIComponent(environments.join(",")),
        tags: encodeURIComponent(
          Object.entries(tags)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_, enabled]) => enabled)
            .map(([tag]) => tag)
            .join(",")
        )
      }
    }
  );

  return data;
};

const fetchAccessibleSecrets = async ({
  projectId,
  secretPath,
  environment,
  filterByAction,
  recursive = false
}: TGetAccessibleSecretsDTO) => {
  const { data } = await apiRequest.get<{ secrets: SecretV3Raw[] }>(
    "/api/v1/dashboard/accessible-secrets",
    {
      params: { projectId, secretPath, environment, filterByAction, recursive }
    }
  );

  return data.secrets;
};

export const useGetProjectSecretsQuickSearch = (
  {
    projectId,
    secretPath,
    search = "",
    environments,
    tags,
    limit,
    offset
  }: TGetDashboardProjectSecretsQuickSearchDTO,
  options?: Omit<
    UseQueryOptions<
      TDashboardProjectSecretsQuickSearchResponse,
      unknown,
      TDashboardProjectSecretsQuickSearch,
      ReturnType<typeof dashboardKeys.getProjectSecretsQuickSearch>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    ...options,
    enabled:
      Boolean(search?.trim() || Object.values(tags).length) &&
      (options?.enabled ?? true) &&
      Boolean(environments.length),
    queryKey: dashboardKeys.getProjectSecretsQuickSearch({
      secretPath,
      search,
      projectId,
      environments,
      tags,
      limit,
      offset
    }),
    queryFn: () =>
      fetchProjectSecretsQuickSearch({
        secretPath,
        search,
        projectId,
        environments,
        tags,
        limit,
        offset
      }),
    select: useCallback((data: Awaited<ReturnType<typeof fetchProjectSecretsQuickSearch>>) => {
      const { secrets, folders, dynamicSecrets, secretRotations, ...counts } = data;

      const groupedFolders = groupBy(folders, (folder) => folder.path);
      const groupedSecrets = groupBy(
        mergePersonalSecrets(secrets),
        (secret) => `${secret.path === "/" ? "" : secret.path}/${secret.key}`
      );
      const groupedDynamicSecrets = groupBy(
        dynamicSecrets,
        (dynamicSecret) =>
          `${dynamicSecret.path === "/" ? "" : dynamicSecret.path}/${dynamicSecret.name}`
      );
      const groupedRotations = groupBy(
        secretRotations,
        (rotation) => `${rotation.folder.path === "/" ? "" : rotation.folder.path}/${rotation.name}`
      );

      return {
        ...counts,
        folders: groupedFolders,
        secrets: groupedSecrets,
        dynamicSecrets: groupedDynamicSecrets,
        secretRotations: groupedRotations
      };
    }, []),
    placeholderData: (previousData) => previousData
  });
};

export const fetchSearchSecretsByMetadata = async ({
  projectId,
  environments,
  secretPath,
  operator,
  filters,
  tags
}: TSearchSecretsByMetadataDTO) => {
  // /secrets-by-metadata parses nested `filters[<n>][key|value|operator]` params (qs syntax) from the
  // raw querystring, so build it explicitly rather than relying on axios' default array serialization.
  const params = new URLSearchParams();
  params.append("projectId", projectId);
  if (environments?.length) params.append("environments", environments.join(","));
  if (secretPath) params.append("secretPath", secretPath);
  params.append("operator", operator);
  filters.forEach((filter, index) => {
    params.append(`filters[${index}][key]`, filter.key);
    params.append(`filters[${index}][value]`, filter.value);
    params.append(`filters[${index}][operator]`, filter.operator);
  });

  // tags are sent as a comma-separated list of enabled slugs (same convention as the deep-search endpoint).
  const enabledTags = Object.entries(tags)
    .filter(([, enabled]) => enabled)
    .map(([slug]) => slug);
  if (enabledTags.length) params.append("tags", enabledTags.join(","));

  const { data } = await apiRequest.get<TSearchSecretsByMetadataResponse>(
    `/api/v1/dashboard/secrets-by-metadata?${params.toString()}`
  );

  return data;
};

export const useSearchSecretsByMetadata = (
  { projectId, operator, filters, tags, environments, secretPath }: TSearchSecretsByMetadataDTO,
  options?: Omit<
    UseQueryOptions<
      TSearchSecretsByMetadataResponse,
      unknown,
      TSearchSecretsByMetadataResponse,
      ReturnType<typeof dashboardKeys.searchSecretsByMetadata>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    ...options,
    enabled: (options?.enabled ?? true) && filters.length > 0 && Boolean(projectId),
    queryKey: dashboardKeys.searchSecretsByMetadata({
      projectId,
      operator,
      filters,
      tags,
      environments,
      secretPath
    }),
    queryFn: () =>
      fetchSearchSecretsByMetadata({
        projectId,
        operator,
        filters,
        tags,
        environments,
        secretPath
      }),
    placeholderData: (previousData) => previousData
  });
};

export const useGetAccessibleSecrets = ({
  projectId,
  secretPath,
  environment,
  filterByAction,
  options,
  recursive = false
}: TGetAccessibleSecretsDTO & {
  options?: Omit<
    UseQueryOptions<
      SecretV3Raw[],
      unknown,
      SecretV3Raw[],
      ReturnType<typeof dashboardKeys.getAccessibleSecrets>
    >,
    "queryKey" | "queryFn"
  >;
}) => {
  return useQuery({
    ...options,
    queryKey: dashboardKeys.getAccessibleSecrets({
      projectId,
      secretPath,
      environment,
      filterByAction,
      recursive
    }),
    queryFn: () =>
      fetchAccessibleSecrets({ projectId, secretPath, environment, filterByAction, recursive })
  });
};

export const fetchSecretValue = async (params: TGetSecretValueDTO) => {
  const { data } = await apiRequest.get<DashboardSecretValue>("/api/v1/dashboard/secret-value", {
    params
  });

  return data;
};

type TPendingSecretValue = {
  params: TGetSecretValueDTO;
  resolve: (value: DashboardSecretValue) => void;
  reject: (reason: unknown) => void;
};

// Every visible overview row asks for its own value, so revealing a page, searching or expanding an
// import would send one request per row. Requests made in the same tick are grouped by folder and
// sent as one secrets-by-keys call instead.
const pendingSecretValues = new Map<string, TPendingSecretValue[]>();

const fetchSecretValuesIndividually = (requests: TPendingSecretValue[]) => {
  requests.forEach(({ params, resolve, reject }) => {
    fetchSecretValue(params).then(resolve, reject);
  });
};

const fetchSecretValueGroup = async (requests: TPendingSecretValue[]) => {
  if (requests.length === 1) {
    fetchSecretValuesIndividually(requests);
    return;
  }

  const { projectId, environment, secretPath } = requests[0].params;
  let secrets: SecretV3Raw[];
  try {
    ({ secrets } = await fetchDashboardProjectSecretsByKeys({
      projectId,
      environment,
      secretPath,
      keys: [...new Set(requests.map(({ params }) => params.secretKey))],
      viewSecretValue: true,
      hideUnreadableValues: true
    }));
  } catch (error) {
    // unreadable values come back masked, so a refusal here is about the request as a whole; each
    // value is fetched on its own so every row still gets its own result
    if (error instanceof AxiosError && error.status === 403) {
      fetchSecretValuesIndividually(requests);
    } else {
      requests.forEach(({ reject }) => reject(error));
    }
    return;
  }

  const secretsByTypeAndKey = new Map(
    secrets.map((secret) => [`${secret.type}:${secret.secretKey}`, secret])
  );
  const unresolved: TPendingSecretValue[] = [];
  requests.forEach((request) => {
    const { secretKey, isOverride } = request.params;
    const type = isOverride ? SecretType.Personal : SecretType.Shared;
    const secret = secretsByTypeAndKey.get(`${type}:${secretKey}`);
    const value = secret?.secretValue;
    if (!secret || secret.secretValueHidden || value === undefined) {
      unresolved.push(request);
      return;
    }

    request.resolve(
      isOverride ? { value: undefined, valueOverride: value } : { value, valueOverride: undefined }
    );
  });

  // a value reached through an import of this folder (cross-project imports) only resolves
  // through /secret-value
  fetchSecretValuesIndividually(unresolved);
};

const fetchSecretValueBatched = (params: TGetSecretValueDTO) =>
  new Promise<DashboardSecretValue>((resolve, reject) => {
    if (!pendingSecretValues.size) {
      setTimeout(() => {
        const groups = [...pendingSecretValues.values()];
        pendingSecretValues.clear();
        groups.forEach((requests) => {
          // anything unexpected must still settle every row, or it would stay loading forever
          fetchSecretValueGroup(requests).catch((error) =>
            requests.forEach((request) => request.reject(error))
          );
        });
      });
    }

    const groupKey = JSON.stringify([params.projectId, params.environment, params.secretPath]);
    const requests = pendingSecretValues.get(groupKey) ?? [];
    requests.push({ params, resolve, reject });
    pendingSecretValues.set(groupKey, requests);
  });

export const useGetSecretValue = (
  params: TGetSecretValueDTO,
  options?: Omit<
    UseQueryOptions<
      DashboardSecretValue,
      unknown,
      DashboardSecretValue,
      ReturnType<typeof dashboardKeys.getSecretValue>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: dashboardKeys.getSecretValue(params),
    queryFn: async () => fetchSecretValueBatched(params),
    staleTime: 1000 * 60,
    retry: (count, error) => {
      // retrying a throttled request only extends the throttle
      if (error instanceof AxiosError && error.status === 429) return false;

      return count < 1;
    },
    ...options
  });
};

export const fetchFolderMoveEligibility = async (
  folderId: string,
  destination?: { destinationEnvironment: string; destinationPath: string }
) => {
  const { data } = await apiRequest.get<FolderMoveEligibilityResponse>(
    `/api/v1/dashboard/folder/move-check/${folderId}`,
    {
      params: destination
        ? {
            destinationEnvironment: destination.destinationEnvironment,
            destinationPath: destination.destinationPath
          }
        : undefined
    }
  );

  return data;
};

// fans out a recursive move-eligibility check per selected folder id and aggregates the results.
// a move is only allowed when every selected folder resolves to canMove === true.
export const useGetFoldersMoveEligibility = (folderIds: string[], enabled = true) =>
  useQueries({
    queries: folderIds.map((folderId) => ({
      queryKey: dashboardKeys.getFolderMoveEligibility(folderId),
      queryFn: () => fetchFolderMoveEligibility(folderId),
      enabled: enabled && Boolean(folderId),

      staleTime: 0,
      gcTime: 0
    })),
    combine: (results) => {
      const isChecking = results.some((result) => result.isLoading || result.isFetching);
      const canMove =
        results.length > 0 &&
        results.every((result) => result.isSuccess && Boolean(result.data?.canMove));

      // the same folder name can appear once per environment, so dedupe by name. the UI only needs
      // to surface which folder is blocked and why (type), not the per-folder path.
      const seen = new Set<string>();
      const blockedFolders: {
        folderName: string;
        blockingType?: FolderMoveBlockingType;
        blockingPath?: string;
      }[] = [];
      // non-blocking: folders whose subtree carries folder-scoped access policies, surfaced as a warning
      const seenRbacWarnings = new Set<string>();
      const foldersWithRbacPolicies: string[] = [];
      results.forEach((result) => {
        const { data } = result;
        if (!data) return;
        if (!data.canMove && !seen.has(data.folderName)) {
          seen.add(data.folderName);
          blockedFolders.push({
            folderName: data.folderName,
            blockingType: data.blockingType,
            blockingPath: data.blockingPath
          });
        }
        if (data.hasRbacPolicies && !seenRbacWarnings.has(data.folderName)) {
          seenRbacWarnings.add(data.folderName);
          foldersWithRbacPolicies.push(data.folderName);
        }
      });

      return { isChecking, canMove, blockedFolders, foldersWithRbacPolicies };
    }
  });

export type FolderMoveBlockedDestination = {
  folderName: string;
  destinationEnvironment: string;
  blockingPath?: string;
  policyName?: string;
};

// fans out a per-(folder, destination) check to see whether the chosen destination is governed by a secret
// approval policy. the move is blocked when any check reports destinationBlocked, and fail-closed on error (the
// backend move would reject it anyway), so the modal never enables a move it cannot complete.
export const useGetFoldersMoveDestinationEligibility = (checks: TFolderMoveDestinationCheck[]) =>
  useQueries({
    queries: checks.map((check) => ({
      queryKey: dashboardKeys.getFolderMoveDestinationEligibility(check),
      queryFn: () =>
        fetchFolderMoveEligibility(check.folderId, {
          destinationEnvironment: check.destinationEnvironment,
          destinationPath: check.destinationPath
        }),
      enabled: Boolean(check.folderId && check.destinationEnvironment)
    })),
    combine: (results) => {
      const isChecking = results.some((result) => result.isLoading);
      const hasError = results.some((result) => result.isError);

      // dedupe by folder + destination environment, since the same folder name can be blocked in one
      // environment but not another (relevant for the multi-environment move).
      const seen = new Set<string>();
      const blockedDestinations: FolderMoveBlockedDestination[] = [];
      results.forEach((result, index) => {
        const check = checks[index];
        if (!check) return;
        const { data } = result;
        if (result.isSuccess && data?.destinationBlocked) {
          const key = `${check.folderName}:${check.destinationEnvironment}`;
          if (!seen.has(key)) {
            seen.add(key);
            blockedDestinations.push({
              folderName: check.folderName,
              destinationEnvironment: check.destinationEnvironment,
              blockingPath: data.destinationBlockingPath,
              policyName: data.destinationPolicyName
            });
          }
        }
      });

      const isDestinationBlocked = hasError || blockedDestinations.length > 0;

      return { isChecking, isDestinationBlocked, blockedDestinations, hasError };
    }
  });

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
  TGetSecretValueDTO,
  TSearchSecretsByMetadataDTO,
  TSearchSecretsByMetadataResponse
} from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { mergePersonalSecrets } from "@app/hooks/api/secrets/queries";
import { groupBy, unique } from "@app/lib/fn/array";

import { SecretV3Raw } from "../types";

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

export const fetchDashboardProjectSecretsByKeys = async ({
  keys,
  ...params
}: TGetDashboardProjectSecretsByKeys) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsByKeys>(
    "/api/v1/dashboard/secrets-by-keys",
    {
      params: {
        ...params,
        keys: encodeURIComponent(keys.join(","))
      }
    }
  );

  return data;
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
    tags
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
      tags
    }),
    queryFn: () =>
      fetchProjectSecretsQuickSearch({
        secretPath,
        search,
        projectId,
        environments,
        tags
      }),
    select: useCallback((data: Awaited<ReturnType<typeof fetchProjectSecretsQuickSearch>>) => {
      const { secrets, folders, dynamicSecrets, secretRotations } = data;

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
  operator,
  filters
}: TSearchSecretsByMetadataDTO) => {
  // /secrets-by-metadata parses nested `filters[<n>][key|value|operator]` params (qs syntax) from the
  // raw querystring, so build it explicitly rather than relying on axios' default array serialization.
  const params = new URLSearchParams();
  params.append("projectId", projectId);
  params.append("operator", operator);
  filters.forEach((filter, index) => {
    params.append(`filters[${index}][key]`, filter.key);
    params.append(`filters[${index}][value]`, filter.value);
    params.append(`filters[${index}][operator]`, filter.operator);
  });

  const { data } = await apiRequest.get<TSearchSecretsByMetadataResponse>(
    `/api/v1/dashboard/secrets-by-metadata?${params.toString()}`
  );

  return data;
};

export const useSearchSecretsByMetadata = (
  { projectId, operator, filters }: TSearchSecretsByMetadataDTO,
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
    queryKey: dashboardKeys.searchSecretsByMetadata({ projectId, operator, filters }),
    queryFn: () => fetchSearchSecretsByMetadata({ projectId, operator, filters }),
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
    queryFn: async () => fetchSecretValue(params),
    staleTime: 1000 * 60,
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
      results.forEach((result) => {
        const { data } = result;
        if (data && !data.canMove && !seen.has(data.folderName)) {
          seen.add(data.folderName);
          blockedFolders.push({
            folderName: data.folderName,
            blockingType: data.blockingType,
            blockingPath: data.blockingPath
          });
        }
      });

      return { isChecking, canMove, blockedFolders };
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

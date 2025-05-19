import { useMemo } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2/enums";
import {
  TSecretRotationGeneratedCredentialsResponseMap,
  TSecretRotationOptionMap,
  TViewSecretRotationGeneratedCredentialsResponse
} from "@app/hooks/api/secretRotationsV2/types";

import { SecretScanningDataSource } from "./enums";
import { TListSecretScanningDataSourceOptions, TSecretScanningDataSourceOption } from "./types";

export const secretScanningV2Keys = {
  all: ["secret-scanning-v2"] as const,
  dataSource: () => [...secretScanningV2Keys.all, "data-source"] as const,
  dataSourceOptions: () => [...secretScanningV2Keys.dataSource(), "options"] as const,
  listDataSources: ({
    projectId,
    type
  }: {
    projectId: string;
    type?: SecretScanningDataSource;
  }) => [...secretScanningV2Keys.dataSource(), "list", projectId, ...(type ? [type] : [])]
};

export const useSecretScanningDataSourceOptions = (
  options?: Omit<
    UseQueryOptions<
      TSecretScanningDataSourceOption[],
      unknown,
      TSecretScanningDataSourceOption[],
      ReturnType<typeof secretScanningV2Keys.dataSourceOptions>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.dataSourceOptions(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretScanningDataSourceOptions>(
        "/api/v2/secret-scanning/data-sources/options"
      );

      return data.dataSourceOptions;
    },
    ...options
  });
};

export const useSecretRotationV2Option = <T extends SecretRotation>(type: T) => {
  const { data: rotationOptions, isPending } = useSecretRotationV2Options();
  return useMemo(
    () => ({
      rotationOption:
        (rotationOptions?.find((opt) => opt.type === type) as TSecretRotationOptionMap[T]) ??
        undefined,
      isLoading: isPending
    }),
    [rotationOptions, type, isPending]
  );
};

export const useViewSecretRotationV2GeneratedCredentials = <T extends SecretRotation>(
  { rotationId, type }: { rotationId: string; type: T },
  options?: Omit<
    UseQueryOptions<
      TViewSecretRotationGeneratedCredentialsResponse,
      unknown,
      TViewSecretRotationGeneratedCredentialsResponse,
      ReturnType<typeof secretScanningV2Keys.viewGeneratedCredentials>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretScanningV2Keys.viewGeneratedCredentials({ sourceId: rotationId, type }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TViewSecretRotationGeneratedCredentialsResponse>(
        `/api/v2/secret-rotations/${type}/${rotationId}/generated-credentials`
      );

      return data as TSecretRotationGeneratedCredentialsResponseMap[T];
    },
    ...options
  });
};

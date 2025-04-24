import { useMemo } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2/enums";
import {
  TListSecretRotationV2Options,
  TSecretRotationGeneratedCredentialsResponseMap,
  TSecretRotationOptionMap,
  TSecretRotationV2Option,
  TViewSecretRotationGeneratedCredentialsResponse,
  TViewSecretRotationV2GeneratedCredentialsDTO
} from "@app/hooks/api/secretRotationsV2/types";

export const secretRotationV2Keys = {
  all: ["secret-rotations-v2"] as const,
  options: () => [...secretRotationV2Keys.all, "options"] as const,
  viewGeneratedCredentials: ({ type, rotationId }: TViewSecretRotationV2GeneratedCredentialsDTO) =>
    [...secretRotationV2Keys.all, type, rotationId] as const
};

export const useSecretRotationV2Options = (
  options?: Omit<
    UseQueryOptions<
      TSecretRotationV2Option[],
      unknown,
      TSecretRotationV2Option[],
      ReturnType<typeof secretRotationV2Keys.options>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretRotationV2Keys.options(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretRotationV2Options>(
        "/api/v2/secret-rotations/options"
      );

      return data.secretRotationOptions;
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
      ReturnType<typeof secretRotationV2Keys.viewGeneratedCredentials>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretRotationV2Keys.viewGeneratedCredentials({ rotationId, type }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TViewSecretRotationGeneratedCredentialsResponse>(
        `/api/v2/secret-rotations/${type}/${rotationId}/generated-credentials`
      );

      return data as TSecretRotationGeneratedCredentialsResponseMap[T];
    },
    ...options
  });
};

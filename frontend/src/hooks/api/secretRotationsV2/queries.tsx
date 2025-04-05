import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2/enums";
import {
  TListSecretRotationV2Options,
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

export const useSecretRotationV2Option = (type: SecretRotation) => {
  const { data: rotationOptions, isPending } = useSecretRotationV2Options();
  const rotationOption = rotationOptions?.find((option) => option.type === type);

  return { rotationOption, isPending };
};

export const useViewSecretRotationV2GeneratedCredentials = (
  { rotationId, type }: TViewSecretRotationV2GeneratedCredentialsDTO,
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

      return data;
    },
    ...options
  });
};

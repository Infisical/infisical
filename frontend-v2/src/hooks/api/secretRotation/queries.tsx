import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetSecretRotationListDTO,
  TGetSecretRotationProviders,
  TSecretRotation,
  TSecretRotationProviderList
} from "./types";

export const secretRotationKeys = {
  listProviders: ({ workspaceId }: TGetSecretRotationProviders) => [
    { workspaceId },
    "secret-rotation-providers"
  ],
  list: ({ workspaceId }: Omit<TGetSecretRotationListDTO, "decryptFileKey">) =>
    [{ workspaceId }, "secret-rotations"] as const
};

const fetchSecretRotationProviders = async ({ workspaceId }: TGetSecretRotationProviders) => {
  const { data } = await apiRequest.get<TSecretRotationProviderList>(
    `/api/v1/secret-rotation-providers/${workspaceId}`
  );
  return data;
};

export const useGetSecretRotationProviders = ({
  workspaceId,
  options = {}
}: TGetSecretRotationProviders & {
  options?: Omit<
    UseQueryOptions<
      TSecretRotationProviderList,
      unknown,
      TSecretRotationProviderList,
      ReturnType<typeof secretRotationKeys.listProviders>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: secretRotationKeys.listProviders({ workspaceId }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryFn: async () => fetchSecretRotationProviders({ workspaceId })
  });

const fetchSecretRotations = async ({
  workspaceId
}: Omit<TGetSecretRotationListDTO, "decryptFileKey">) => {
  const { data } = await apiRequest.get<{ secretRotations: TSecretRotation[] }>(
    "/api/v1/secret-rotations",
    { params: { workspaceId } }
  );
  return data.secretRotations;
};

export const useGetSecretRotations = ({
  workspaceId,
  options = {}
}: TGetSecretRotationListDTO & {
  options?: Omit<
    UseQueryOptions<
      TSecretRotation[],
      unknown,
      TSecretRotation[],
      ReturnType<typeof secretRotationKeys.list>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: secretRotationKeys.list({ workspaceId }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryFn: async () => fetchSecretRotations({ workspaceId })
  });

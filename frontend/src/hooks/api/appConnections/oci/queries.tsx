import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TListOCIVaultKeys, TListOCIVaults, TOCIVault, TOCIVaultKey } from "./types";

const ociConnectionKeys = {
  all: [...appConnectionKeys.all, "oci"] as const,
  listVaults: (connectionId: string) => [...ociConnectionKeys.all, "vaults", connectionId] as const,
  listVaultKeys: (connectionId: string) => [...ociConnectionKeys.all, "keys", connectionId] as const
};

export const useOCIConnectionListVaults = (
  { connectionId, compartmentOcid }: TListOCIVaults,
  options?: Omit<
    UseQueryOptions<
      TOCIVault[],
      unknown,
      TOCIVault[],
      ReturnType<typeof ociConnectionKeys.listVaults>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: ociConnectionKeys.listVaults(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOCIVault[]>(
        `/api/v1/app-connections/oci/${connectionId}/vaults`,
        {
          params: {
            compartmentOcid
          }
        }
      );

      return data;
    },
    ...options
  });
};

export const useOCIConnectionListVaultKeys = (
  { connectionId, compartmentOcid, vaultOcid }: TListOCIVaultKeys,
  options?: Omit<
    UseQueryOptions<
      TOCIVaultKey[],
      unknown,
      TOCIVaultKey[],
      ReturnType<typeof ociConnectionKeys.listVaultKeys>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: ociConnectionKeys.listVaultKeys(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOCIVaultKey[]>(
        `/api/v1/app-connections/oci/${connectionId}/vault-keys`,
        {
          params: {
            compartmentOcid,
            vaultOcid
          }
        }
      );

      return data;
    },
    ...options
  });
};

import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TListOCIVaultKeys,
  TListOCIVaults,
  TOCICompartment,
  TOCIVault,
  TOCIVaultKey
} from "./types";

const ociConnectionKeys = {
  all: [...appConnectionKeys.all, "oci"] as const,
  listCompartments: (connectionId: string) =>
    [...ociConnectionKeys.all, "compartments", connectionId] as const,
  listVaults: (connectionId: string, compartmentOcid: string) =>
    [...ociConnectionKeys.all, "vaults", connectionId, compartmentOcid] as const,
  listVaultKeys: (connectionId: string, compartmentOcid: string, vaultOcid: string) =>
    [...ociConnectionKeys.all, "keys", connectionId, compartmentOcid, vaultOcid] as const
};

export const useOCIConnectionListCompartments = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TOCICompartment[],
      unknown,
      TOCICompartment[],
      ReturnType<typeof ociConnectionKeys.listCompartments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: ociConnectionKeys.listCompartments(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOCICompartment[]>(
        `/api/v1/app-connections/oci/${connectionId}/compartments`
      );

      return data;
    },
    ...options
  });
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
    queryKey: ociConnectionKeys.listVaults(connectionId, compartmentOcid),
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
    queryKey: ociConnectionKeys.listVaultKeys(connectionId, compartmentOcid, vaultOcid),
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

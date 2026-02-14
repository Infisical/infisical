import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";

const hcVaultConnectionKeys = {
  all: [...appConnectionKeys.all, "hcvault"] as const,
  listMounts: (connectionId: string) =>
    [...hcVaultConnectionKeys.all, "mounts", connectionId] as const
};

export const useHCVaultConnectionListMounts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      string[],
      unknown,
      string[],
      ReturnType<typeof hcVaultConnectionKeys.listMounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: hcVaultConnectionKeys.listMounts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<string[]>(
        `/api/v1/app-connections/hashicorp-vault/${connectionId}/mounts`,
        {}
      );

      return data;
    },
    ...options
  });
};

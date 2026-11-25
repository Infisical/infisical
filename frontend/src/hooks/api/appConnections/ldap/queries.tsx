import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";

export type TLdapDirectoryMachine = {
  hostname: string;
};

export type TLdapDirectoryGroup = {
  sid: string;
  name: string;
};

export type TLdapDirectoryGroupSearch = {
  groups: TLdapDirectoryGroup[];
  isTruncated: boolean;
};

const ldapConnectionKeys = {
  all: [...appConnectionKeys.all, "ldap"] as const,
  listMachines: (connectionId: string, search?: string) =>
    [...ldapConnectionKeys.all, "machines", connectionId, ...(search ? [search] : [])] as const,
  listGroups: (connectionId: string, search?: string) =>
    [...ldapConnectionKeys.all, "groups", connectionId, ...(search ? [search] : [])] as const
};

export const useLdapConnectionListMachines = (
  connectionId: string,
  search?: string,
  options?: Omit<
    UseQueryOptions<
      TLdapDirectoryMachine[],
      unknown,
      TLdapDirectoryMachine[],
      ReturnType<typeof ldapConnectionKeys.listMachines>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    placeholderData: (previous) => previous,
    queryKey: ldapConnectionKeys.listMachines(connectionId, search),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ machines: TLdapDirectoryMachine[] }>(
        `/api/v1/app-connections/ldap/${connectionId}/machines`,
        { params: { ...(search ? { search } : {}) } }
      );

      return data.machines;
    },
    ...options
  });
};

export const useLdapConnectionListGroups = (connectionId?: string, search?: string) =>
  useQuery({
    queryKey: ldapConnectionKeys.listGroups(connectionId ?? "", search),
    queryFn: async () => {
      const { data } = await apiRequest.get<TLdapDirectoryGroupSearch>(
        `/api/v1/app-connections/ldap/${connectionId}/groups`,
        { params: { ...(search ? { search } : {}) } }
      );
      return data;
    },
    enabled: Boolean(connectionId)
  });

import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { LDAPGroupMap } from "./types";

export const ldapConfigKeys = {
  getLDAPConfig: (orgId: string) => [{ orgId }, "organization-ldap"] as const,
  getLDAPGroupMaps: (ldapConfigId: string) => [{ ldapConfigId }, "ldap-group-maps"] as const
};

export const useGetLDAPConfig = (organizationId: string) => {
  return useQuery({
    queryKey: ldapConfigKeys.getLDAPConfig(organizationId),
    queryFn: async () => {
      try {
        const { data } = await apiRequest.get(
          `/api/v1/ldap/config?organizationId=${organizationId}`
        );

        return data;
      } catch {
        return null;
      }
    },
    enabled: true
  });
};

export const useGetLDAPGroupMaps = (ldapConfigId: string) => {
  return useQuery({
    queryKey: ldapConfigKeys.getLDAPGroupMaps(ldapConfigId),
    queryFn: async () => {
      if (!ldapConfigId) return [];

      const { data } = await apiRequest.get<LDAPGroupMap[]>(
        `/api/v1/ldap/config/${ldapConfigId}/group-maps`
      );

      return data;
    },
    enabled: true
  });
};

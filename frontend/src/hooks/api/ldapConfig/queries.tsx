import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export const ldapConfigKeys = {
  getLDAPConfig: (orgId: string) => [{ orgId }, "organization-ldap"] as const
};

export const useGetLDAPConfig = (organizationId: string) => {
  return useQuery({
    queryKey: ldapConfigKeys.getLDAPConfig(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get(`/api/v1/ldap/config?organizationId=${organizationId}`);

      return data;
    },
    enabled: true
  });
};

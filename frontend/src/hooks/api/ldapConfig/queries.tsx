import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

const ldapConfigKeys = {
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

export const useCreateLDAPConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      isActive,
      url,
      bindDN,
      bindPass,
      searchBase,
      caCert
    }: {
      organizationId: string;
      isActive: boolean;
      url: string;
      bindDN: string;
      bindPass: string;
      searchBase: string;
      caCert?: string;
    }) => {
      const { data } = await apiRequest.post("/api/v1/ldap/config", {
        organizationId,
        isActive,
        url,
        bindDN,
        bindPass,
        searchBase,
        caCert
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries(ldapConfigKeys.getLDAPConfig(dto.organizationId));
    }
  });
};

export const useUpdateLDAPConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      isActive,
      url,
      bindDN,
      bindPass,
      searchBase,
      caCert
    }: {
      organizationId: string;
      isActive?: boolean;
      url?: string;
      bindDN?: string;
      bindPass?: string;
      searchBase?: string;
      caCert?: string;
    }) => {
      const { data } = await apiRequest.patch("/api/v1/ldap/config", {
        organizationId,
        isActive,
        url,
        bindDN,
        bindPass,
        searchBase,
        caCert
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries(ldapConfigKeys.getLDAPConfig(dto.organizationId));
    }
  });
};

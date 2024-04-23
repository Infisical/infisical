import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ldapConfigKeys } from "./queries";

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
      groupSearchBase,
      groupSearchFilter,
      caCert
    }: {
      organizationId: string;
      isActive: boolean;
      url: string;
      bindDN: string;
      bindPass: string;
      searchBase: string;
      groupSearchBase: string;
      groupSearchFilter: string;
      caCert?: string;
    }) => {
      const { data } = await apiRequest.post("/api/v1/ldap/config", {
        organizationId,
        isActive,
        url,
        bindDN,
        bindPass,
        searchBase,
        groupSearchBase,
        groupSearchFilter,
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
      groupSearchBase,
      groupSearchFilter,
      caCert
    }: {
      organizationId: string;
      isActive?: boolean;
      url?: string;
      bindDN?: string;
      bindPass?: string;
      searchBase?: string;
      groupSearchBase?: string;
      groupSearchFilter?: string;
      caCert?: string;
    }) => {
      const { data } = await apiRequest.patch("/api/v1/ldap/config", {
        organizationId,
        isActive,
        url,
        bindDN,
        bindPass,
        searchBase,
        groupSearchBase,
        groupSearchFilter,
        caCert
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries(ldapConfigKeys.getLDAPConfig(dto.organizationId));
    }
  });
};

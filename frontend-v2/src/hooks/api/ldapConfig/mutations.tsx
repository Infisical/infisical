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
      uniqueUserAttribute,
      searchBase,
      searchFilter,
      groupSearchBase,
      groupSearchFilter,
      caCert
    }: {
      organizationId: string;
      isActive: boolean;
      url: string;
      bindDN: string;
      bindPass: string;
      uniqueUserAttribute: string;
      searchBase: string;
      searchFilter: string;
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
        uniqueUserAttribute,
        searchBase,
        searchFilter,
        groupSearchBase,
        groupSearchFilter,
        caCert
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPConfig(dto.organizationId) });
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
      uniqueUserAttribute,
      searchBase,
      searchFilter,
      groupSearchBase,
      groupSearchFilter,
      caCert
    }: {
      organizationId: string;
      isActive?: boolean;
      url?: string;
      bindDN?: string;
      bindPass?: string;
      uniqueUserAttribute?: string;
      searchBase?: string;
      searchFilter?: string;
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
        uniqueUserAttribute,
        searchBase,
        searchFilter,
        groupSearchBase,
        groupSearchFilter,
        caCert
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPConfig(dto.organizationId) });
    }
  });
};

export const useCreateLDAPGroupMapping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ldapConfigId,
      ldapGroupCN,
      groupSlug
    }: {
      ldapConfigId: string;
      ldapGroupCN: string;
      groupSlug: string;
    }) => {
      const { data } = await apiRequest.post(`/api/v1/ldap/config/${ldapConfigId}/group-maps`, {
        ldapGroupCN,
        groupSlug
      });
      return data;
    },
    onSuccess(_, { ldapConfigId }) {
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPGroupMaps(ldapConfigId) });
    }
  });
};

export const useDeleteLDAPGroupMapping = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ldapConfigId,
      ldapGroupMapId
    }: {
      ldapConfigId: string;
      ldapGroupMapId: string;
    }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/ldap/config/${ldapConfigId}/group-maps/${ldapGroupMapId}`
      );
      return data;
    },
    onSuccess(_, { ldapConfigId }) {
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPGroupMaps(ldapConfigId) });
    }
  });
};

export const useTestLDAPConnection = () => {
  return useMutation({
    mutationFn: async (ldapConfigId: string) => {
      const { data } = await apiRequest.post<boolean>(
        `/api/v1/ldap/config/${ldapConfigId}/test-connection`
      );
      return data;
    }
  });
};

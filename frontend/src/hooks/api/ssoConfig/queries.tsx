import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { ldapConfigKeys } from "@app/hooks/api/ldapConfig/queries";
import { oidcConfigKeys } from "@app/hooks/api/oidcConfig/queries";
import { organizationKeys } from "@app/hooks/api/organization/queries";

export const ssoConfigKeys = {
  getSSOConfig: (orgId: string) => [{ orgId }, "organization-saml-sso"] as const
};

export const useGetSSOConfig = (organizationId: string) => {
  return useQuery({
    queryKey: ssoConfigKeys.getSSOConfig(organizationId),
    queryFn: async () => {
      try {
        const { data } = await apiRequest.get(
          `/api/v1/sso/config?organizationId=${organizationId}`
        );

        return data;
      } catch {
        return null;
      }
    },
    enabled: true
  });
};

export const useCreateSSOConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      authProvider,
      isActive,
      entryPoint,
      issuer,
      cert,
      enableGroupSync
    }: {
      organizationId: string;
      authProvider: string;
      isActive: boolean;
      entryPoint: string;
      issuer: string;
      cert: string;
      enableGroupSync?: boolean;
    }) => {
      const { data } = await apiRequest.post("/api/v1/sso/config", {
        organizationId,
        authProvider,
        isActive,
        entryPoint,
        issuer,
        cert,
        ...(enableGroupSync !== undefined ? { enableGroupSync } : {})
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: ssoConfigKeys.getSSOConfig(dto.organizationId) });
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPConfig(dto.organizationId) });
      queryClient.invalidateQueries({ queryKey: oidcConfigKeys.getOIDCConfig(dto.organizationId) });
    }
  });
};

export const useUpdateSSOConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      authProvider,
      isActive,
      entryPoint,
      issuer,
      cert,
      enableGroupSync
    }: {
      organizationId: string;
      authProvider?: string;
      isActive?: boolean;
      entryPoint?: string;
      issuer?: string;
      cert?: string;
      enableGroupSync?: boolean;
    }) => {
      const { data } = await apiRequest.patch("/api/v1/sso/config", {
        organizationId,
        ...(authProvider !== undefined ? { authProvider } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(entryPoint !== undefined ? { entryPoint } : {}),
        ...(issuer !== undefined ? { issuer } : {}),
        ...(cert !== undefined ? { cert } : {}),
        ...(enableGroupSync !== undefined ? { enableGroupSync } : {})
      });

      return data;
    },
    onSuccess(_, { organizationId, isActive }) {
      if (isActive === false) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
      }

      queryClient.invalidateQueries({ queryKey: ssoConfigKeys.getSSOConfig(organizationId) });
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPConfig(organizationId) });
      queryClient.invalidateQueries({ queryKey: oidcConfigKeys.getOIDCConfig(organizationId) });
    }
  });
};

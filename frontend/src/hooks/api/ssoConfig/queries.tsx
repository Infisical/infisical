import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

const ssoConfigKeys = {
    getSSOConfig: (orgId: string) => [{ orgId }, "organization-saml-sso"] as const,
}

export const useGetSSOConfig = (organizationId: string) => {
  return useQuery({
    queryKey: ssoConfigKeys.getSSOConfig(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get(
        `/api/v1/sso/config?organizationId=${organizationId}`
      );

      return data;
    },
    enabled: true
  });
}

export const useCreateSSOConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      authProvider,
      isActive,
      entryPoint,
      issuer,
      cert
    }: {
      organizationId: string;
      authProvider: string;
      isActive: boolean;
      entryPoint: string;
      issuer: string;
      cert: string;
    }) => {
      const { data } = await apiRequest.post(
        "/api/v1/sso/config",
        {
          organizationId,
          authProvider,
          isActive,
          entryPoint,
          issuer,
          cert
        }
      );
      
      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries(ssoConfigKeys.getSSOConfig(dto.organizationId));
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
      cert
    }: {
      organizationId: string;
      authProvider?: string;
      isActive?: boolean;
      entryPoint?: string;
      issuer?: string;
      cert?: string;
    }) => {
      const { data } = await apiRequest.patch(
        "/api/v1/sso/config",
        {
          organizationId,
          ...(authProvider !== undefined ? { authProvider } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(entryPoint !== undefined ? { entryPoint } : {}),
          ...(issuer !== undefined ? { issuer } : {}),
          ...(cert !== undefined ? { cert } : {})
        }
      );
      
      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries(ssoConfigKeys.getSSOConfig(dto.organizationId));
    }
  });
};
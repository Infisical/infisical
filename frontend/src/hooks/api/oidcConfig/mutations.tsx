import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { oidcConfigKeys } from "./queries";

export const useUpdateOIDCConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issuer,
      authorizationEndpoint,
      configurationType,
      discoveryURL,
      jwksUri,
      tokenEndpoint,
      userinfoEndpoint,
      allowedEmailDomains,
      clientId,
      clientSecret,
      isActive,
      orgSlug
    }: {
      allowedEmailDomains?: string;
      issuer?: string;
      authorizationEndpoint?: string;
      discoveryURL?: string;
      jwksUri?: string;
      tokenEndpoint?: string;
      userinfoEndpoint?: string;
      clientId?: string;
      clientSecret?: string;
      isActive?: boolean;
      configurationType?: string;
      orgSlug: string;
    }) => {
      const { data } = await apiRequest.patch("/api/v1/sso/oidc/config", {
        issuer,
        allowedEmailDomains,
        authorizationEndpoint,
        discoveryURL,
        configurationType,
        jwksUri,
        tokenEndpoint,
        userinfoEndpoint,
        clientId,
        orgSlug,
        clientSecret,
        isActive
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries(oidcConfigKeys.getOIDCConfig(dto.orgSlug));
      queryClient.invalidateQueries(organizationKeys.getUserOrganizations);
    }
  });
};

export const useCreateOIDCConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issuer,
      configurationType,
      discoveryURL,
      authorizationEndpoint,
      allowedEmailDomains,
      jwksUri,
      tokenEndpoint,
      userinfoEndpoint,
      clientId,
      clientSecret,
      isActive,
      orgSlug
    }: {
      issuer?: string;
      configurationType: string;
      discoveryURL?: string;
      authorizationEndpoint?: string;
      jwksUri?: string;
      tokenEndpoint?: string;
      userinfoEndpoint?: string;
      clientId: string;
      clientSecret: string;
      isActive: boolean;
      orgSlug: string;
      allowedEmailDomains?: string;
    }) => {
      const { data } = await apiRequest.post("/api/v1/sso/oidc/config", {
        issuer,
        configurationType,
        discoveryURL,
        authorizationEndpoint,
        allowedEmailDomains,
        jwksUri,
        tokenEndpoint,
        userinfoEndpoint,
        clientId,
        clientSecret,
        isActive,
        orgSlug
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries(oidcConfigKeys.getOIDCConfig(dto.orgSlug));
    }
  });
};

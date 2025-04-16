import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { oidcConfigKeys } from "./queries";
import { OIDCJWTSignatureAlgorithm } from "./types";

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
      orgSlug,
      manageGroupMemberships,
      jwtSignatureAlgorithm
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
      manageGroupMemberships?: boolean;
      jwtSignatureAlgorithm?: OIDCJWTSignatureAlgorithm;
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
        isActive,
        manageGroupMemberships,
        jwtSignatureAlgorithm
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: oidcConfigKeys.getOIDCConfig(dto.orgSlug) });
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
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
      orgSlug,
      manageGroupMemberships,
      jwtSignatureAlgorithm
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
      manageGroupMemberships?: boolean;
      jwtSignatureAlgorithm?: OIDCJWTSignatureAlgorithm;
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
        orgSlug,
        manageGroupMemberships,
        jwtSignatureAlgorithm
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: oidcConfigKeys.getOIDCConfig(dto.orgSlug) });
    }
  });
};

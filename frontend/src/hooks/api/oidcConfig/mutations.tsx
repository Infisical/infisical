import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { ldapConfigKeys } from "@app/hooks/api/ldapConfig/queries";
import { ssoConfigKeys } from "@app/hooks/api/ssoConfig/queries";

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
      manageGroupMemberships,
      jwtSignatureAlgorithm,
      mfaClaimName,
      mfaAmrValues
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
      organizationId: string;
      manageGroupMemberships?: boolean;
      jwtSignatureAlgorithm?: OIDCJWTSignatureAlgorithm;
      mfaClaimName?: string;
      mfaAmrValues?: string[] | null;
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
        clientSecret,
        isActive,
        manageGroupMemberships,
        jwtSignatureAlgorithm,
        mfaClaimName,
        mfaAmrValues
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: oidcConfigKeys.getOIDCConfig(dto.organizationId) });
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPConfig(dto.organizationId) });
      queryClient.invalidateQueries({ queryKey: ssoConfigKeys.getSSOConfig(dto.organizationId) });
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
      manageGroupMemberships,
      jwtSignatureAlgorithm,
      mfaClaimName,
      mfaAmrValues
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
      organizationId: string;
      allowedEmailDomains?: string;
      manageGroupMemberships?: boolean;
      jwtSignatureAlgorithm?: OIDCJWTSignatureAlgorithm;
      mfaClaimName?: string;
      mfaAmrValues?: string[] | null;
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
        manageGroupMemberships,
        jwtSignatureAlgorithm,
        mfaClaimName,
        mfaAmrValues
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: oidcConfigKeys.getOIDCConfig(dto.organizationId) });
      queryClient.invalidateQueries({ queryKey: ldapConfigKeys.getLDAPConfig(dto.organizationId) });
      queryClient.invalidateQueries({ queryKey: ssoConfigKeys.getSSOConfig(dto.organizationId) });
    }
  });
};

export const useDeleteOIDCConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, { organizationId: string }>({
    mutationFn: async () => {
      const { data } = await apiRequest.delete("/api/v1/sso/oidc/config");
      return data;
    },
    onSuccess(_, { organizationId }) {
      queryClient.invalidateQueries({ queryKey: oidcConfigKeys.getOIDCConfig(organizationId) });
      queryClient.invalidateQueries({
        queryKey: oidcConfigKeys.getOIDCManageGroupMembershipsEnabled(organizationId)
      });
      // Deleting the config also turns off SSO enforcement and SCIM on the organization
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
    }
  });
};

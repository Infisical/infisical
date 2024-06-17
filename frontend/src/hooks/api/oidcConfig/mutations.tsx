import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { oidcConfigKeys } from "./queries";

export const useUpdateOIDCConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issuer,
      authorizationEndpoint,
      jwksUri,
      tokenEndpoint,
      userinfoEndpoint,
      clientId,
      clientSecret,
      isActive,
      orgSlug
    }: {
      issuer?: string;
      authorizationEndpoint?: string;
      jwksUri?: string;
      tokenEndpoint?: string;
      userinfoEndpoint?: string;
      clientId?: string;
      clientSecret?: string;
      isActive?: boolean;
      orgSlug: string;
    }) => {
      const { data } = await apiRequest.patch("/api/v1/sso/oidc/config", {
        issuer,
        authorizationEndpoint,
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
    }
  });
};

export const useCreateOIDCConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issuer,
      authorizationEndpoint,
      jwksUri,
      tokenEndpoint,
      userinfoEndpoint,
      clientId,
      clientSecret,
      isActive,
      orgSlug
    }: {
      issuer: string;
      authorizationEndpoint: string;
      jwksUri: string;
      tokenEndpoint: string;
      userinfoEndpoint: string;
      clientId: string;
      clientSecret: string;
      isActive: boolean;
      orgSlug: string;
    }) => {
      const { data } = await apiRequest.post("/api/v1/sso/oidc/config", {
        issuer,
        authorizationEndpoint,
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

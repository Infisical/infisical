import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { webAuthnKeys } from "./queries";
import {
  TDeleteWebAuthnCredentialDTO,
  TGenerateAuthenticationOptionsResponse,
  TGenerateRegistrationOptionsResponse,
  TUpdateWebAuthnCredentialDTO,
  TVerifyAuthenticationDTO,
  TVerifyRegistrationDTO
} from "./types";

export const useGenerateRegistrationOptions = () =>
  useMutation({
    mutationFn: async () => {
      const { data } = await apiRequest.post<TGenerateRegistrationOptionsResponse>(
        "/api/v1/user/me/webauthn/register",
        {}
      );
      return data;
    }
  });

export const useVerifyRegistration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TVerifyRegistrationDTO) => {
      const { data } = await apiRequest.post<{ credentialId: string; name?: string | null }>(
        "/api/v1/user/me/webauthn/register/verify",
        dto
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webAuthnKeys.credentials });
    }
  });
};

export const useGenerateAuthenticationOptions = () =>
  useMutation({
    mutationFn: async () => {
      const { data } = await apiRequest.post<TGenerateAuthenticationOptionsResponse>(
        "/api/v1/user/me/webauthn/authenticate",
        {}
      );
      return data;
    }
  });

export const useVerifyAuthentication = () =>
  useMutation({
    mutationFn: async (dto: TVerifyAuthenticationDTO) => {
      const { data } = await apiRequest.post<{
        verified: boolean;
        credentialId: string;
        sessionToken: string;
      }>("/api/v1/user/me/webauthn/authenticate/verify", dto);
      return data;
    }
  });

export const useDeleteWebAuthnCredential = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: TDeleteWebAuthnCredentialDTO) => {
      const { data } = await apiRequest.delete<{ success: boolean }>(
        `/api/v1/user/me/webauthn/${id}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webAuthnKeys.credentials });
    }
  });
};

export const useUpdateWebAuthnCredential = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: TUpdateWebAuthnCredentialDTO) => {
      const { data } = await apiRequest.patch<{
        id: string;
        credentialId: string;
        name?: string | null;
      }>(`/api/v1/user/me/webauthn/${id}`, { name });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webAuthnKeys.credentials });
    }
  });
};

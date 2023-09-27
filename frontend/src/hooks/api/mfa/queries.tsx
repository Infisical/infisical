import { useMutation, useQuery,UseQueryResult } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  CreateNewMfaRecoveryCodesResponse,
  DisableMfaAuthAppResponse,
  DisableMfaEmailResponse,
  EnableAuthAppMfaStep1Response,
  EnableAuthAppMfaStep2Params,
  EnableAuthAppMfaStep2Response,
  EnableMfaEmailResponse,
  GetMyMfaRecoveryCodesResponse,
  UpdateMfaPreferenceParams,
  UpdateMfaPreferenceResponse,
} from "./types";

// email

export const enableMfaEmail = async (): Promise<EnableMfaEmailResponse> => {
  const { data: { enabled } } = await apiRequest.post("/api/v3/mfa/email/enable");
  return enabled;
};

export const disableMfaEmail = async (): Promise<DisableMfaEmailResponse> => {
  const { data: { disabled} } = await apiRequest.post("/api/v3/mfa/email/disable");
  return disabled;
};

// authenticator app

export const enableMfaAuthAppStep1 = async (): Promise<EnableAuthAppMfaStep1Response> => {
  const { data: { authAppSecretKey} } = await apiRequest.post("/api/v3/mfa/auth-app/enable1");
  return authAppSecretKey;
};

export const enableMfaAuthAppStep2 = async ({ userTotp }: EnableAuthAppMfaStep2Params): Promise<EnableAuthAppMfaStep2Response> => {
  const { data: { enabled } } = await apiRequest.post("/api/v3/mfa/auth-app/enable2", {
    userTotp,
  });
  return enabled;
};

export const disableMfaAuthApp = async (): Promise<DisableMfaAuthAppResponse> => {
  const { data: { disabled} } = await apiRequest.post("/api/v3/mfa/auth-app/disable");
  return disabled;
};

// recovery codes

export const useCreateNewMfaRecoveryCodes = () => {
  return useMutation<CreateNewMfaRecoveryCodesResponse>(
    async () => {
      const { data } = await apiRequest.put("/api/v3/mfa/recovery-codes/create");
      return data;
    }
  );
};

export const useGetMyMfaRecoveryCodes = (): UseQueryResult<GetMyMfaRecoveryCodesResponse> => {
  return useQuery<GetMyMfaRecoveryCodesResponse>({
    queryFn: async () => {
      const { data } = await apiRequest.get("/api/v3/mfa/recovery-codes/show");
      return data;
    },
    enabled: true,
  });
};

// all

export const updateMfaPreference = async ({
  mfaPreference,
}: UpdateMfaPreferenceParams): Promise<UpdateMfaPreferenceResponse> => {
  const { data } = await apiRequest.put("/api/v3/mfa/update-preference", {
    mfaPreference,
  });
  return data;
};

type DisableMfaAllResponse = boolean;

export const disableMfaAll = async (): Promise<DisableMfaAllResponse> => {
  const { data: { disabled } } = await apiRequest.post("/api/v3/mfa/disable-all");
  return disabled;
};

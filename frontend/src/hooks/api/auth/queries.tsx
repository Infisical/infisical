import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { setAuthToken } from "@app/reactQuery";

import {
  GetAuthTokenAPI,
  SendMfaTokenDTO,
  VerifyMfaTokenDTO,
  VerifyMfaTokenRes} from "./types";

const authKeys = {
  getAuthToken: ["token"] as const,
  commonPasswords: ["common-passwords"] as const
};

export const useSendMfaToken = () => {
  return useMutation<{}, {}, SendMfaTokenDTO>({
    mutationFn: async ({ email }) => {
      const { data } = await apiRequest.post("/api/v2/auth/mfa/send", { email });
      return data;
    }
  });
}

export const useVerifyMfaToken = () => {
  return useMutation<VerifyMfaTokenRes, {}, VerifyMfaTokenDTO>({
    mutationFn: async ({ email, mfaCode }) => {
      const { data } = await apiRequest.post("/api/v2/auth/mfa/verify", {
        email,
        mfaToken: mfaCode
      });
      return data;
    }
  });
}

// Refresh token is set as cookie when logged in
// Using that we fetch the auth bearer token needed for auth calls
const fetchAuthToken = async () => {
  const { data } = await apiRequest.post<GetAuthTokenAPI>("/api/v1/auth/token", undefined, {
    withCredentials: true
  });

  return data;
};

export const useGetAuthToken = () =>
  useQuery(authKeys.getAuthToken, fetchAuthToken, {
    onSuccess: (data) => setAuthToken(data.token),
    retry: 0
  });

export const useRevokeAllSessions = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiRequest.delete("/api/v1/auth/sessions");
      return data;
    }
  });
}

const fetchCommonPasswords = async () => {
  const { data } = await apiRequest.get("/api/v1/auth/common-passwords");
  return data || [];
};

export const useGetCommonPasswords = () =>
  useQuery({ queryKey: authKeys.commonPasswords, queryFn: fetchCommonPasswords });
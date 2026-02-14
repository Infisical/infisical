import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TSendAccountRecoveryEmailDTO,
  TVerifyAccountRecoveryEmailDTO,
  TVerifyAccountRecoveryEmailResponse
} from "./types";

export const useSendAccountRecoveryEmail = () => {
  return useMutation({
    mutationFn: async ({ email }: TSendAccountRecoveryEmailDTO) => {
      const { data } = await apiRequest.post("/api/v1/account-recovery/send-email", {
        email
      });

      return data;
    }
  });
};

export const useVerifyAccountRecoveryEmail = () => {
  return useMutation({
    mutationFn: async ({ email, code }: TVerifyAccountRecoveryEmailDTO) => {
      const { data } = await apiRequest.post<TVerifyAccountRecoveryEmailResponse>(
        "/api/v1/account-recovery/verify-email",
        {
          email,
          code
        }
      );

      return data;
    }
  });
};

export const useEnableEmailAuthAccountRecovery = () => {
  return useMutation({
    mutationFn: async (token: string) => {
      const { data } = await apiRequest.post<TVerifyAccountRecoveryEmailResponse>(
        "/api/v1/account-recovery/enable-email-auth",
        {},
        {
          headers: {
            authorization: `Bearer ${token}`
          }
        }
      );

      return data;
    }
  });
};

import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { MfaMethod } from "../auth/types";

export enum MfaSessionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE"
}

export type TMfaSessionStatusResponse = {
  status: MfaSessionStatus;
  mfaMethod: MfaMethod;
};

export type TVerifyMfaSessionRequest = {
  mfaSessionId: string;
  mfaToken: string;
  mfaMethod: MfaMethod;
};

export type TVerifyMfaSessionResponse = {
  success: boolean;
  message: string;
};

export const useMfaSessionStatus = (mfaSessionId: string, enabled = true) => {
  return useQuery({
    queryKey: ["mfa-session-status", mfaSessionId],
    queryFn: async () => {
      const { data } = await apiRequest.get<TMfaSessionStatusResponse>(
        `/api/v2/mfa-sessions/${mfaSessionId}/status`
      );
      return data;
    },
    enabled,
    refetchInterval: (query) => {
      // Poll every 2 seconds if status is still PENDING
      if (query.state.data?.status === MfaSessionStatus.PENDING) {
        return 2000;
      }
      return false;
    }
  });
};

export const useVerifyMfaSession = () => {
  return useMutation({
    mutationFn: async ({ mfaSessionId, mfaToken, mfaMethod }: TVerifyMfaSessionRequest) => {
      const { data } = await apiRequest.post<TVerifyMfaSessionResponse>(
        `/api/v2/mfa-sessions/${mfaSessionId}/verify`,
        {
          mfaToken,
          mfaMethod
        }
      );
      return data;
    }
  });
};

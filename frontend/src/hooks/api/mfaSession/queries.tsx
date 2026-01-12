import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  MfaSessionStatus,
  TMfaSessionStatusResponse,
  TVerifyMfaSessionRequest,
  TVerifyMfaSessionResponse
} from "./types";

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

import { useCallback, useRef } from "react";

import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession/types";

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

type TMfaRequiredError = {
  response?: {
    data?: {
      error?: string;
      message?: string;
      details?: { mfaSessionId?: string };
    };
  };
};

// An MFA-gated PAM request answers with SESSION_MFA_REQUIRED and a fresh session id to verify
export const extractMfaSessionId = (err: unknown): string | undefined => {
  const data = (err as TMfaRequiredError)?.response?.data;
  return data?.error === "SESSION_MFA_REQUIRED" ? data.details?.mfaSessionId : undefined;
};

export type TMfaChallengeOutcome = "verified" | "blocked" | "failed";

// Opens the verification page in a popup and resolves once the session goes active
export const useMfaChallenge = () => {
  const popupRef = useRef<Window | null>(null);

  return useCallback(async (mfaSessionId: string): Promise<TMfaChallengeOutcome> => {
    popupRef.current = window.open(
      `${window.location.origin}/mfa-session/${mfaSessionId}`,
      "_blank"
    );
    if (!popupRef.current) return "blocked";

    const startTime = Date.now();

    const verified = await new Promise<boolean>((resolve) => {
      const interval = setInterval(async () => {
        if (Date.now() - startTime > MFA_TIMEOUT) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        try {
          const { data } = await apiRequest.get<TMfaSessionStatusResponse>(
            `/api/v2/mfa-sessions/${mfaSessionId}/status`
          );
          if (data.status === MfaSessionStatus.ACTIVE) {
            clearInterval(interval);
            resolve(true);
          }
        } catch {
          clearInterval(interval);
          resolve(false);
        }
      }, MFA_POLL_INTERVAL);
    });

    if (!popupRef.current.closed) popupRef.current.close();
    return verified ? "verified" : "failed";
  }, []);
};

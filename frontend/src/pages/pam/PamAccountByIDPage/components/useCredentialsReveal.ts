import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";
import { TPamAccountCredentialsResponse } from "@app/hooks/api/pam/queries";

export type RevealState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "mfa-verifying" }
  | { status: "error"; message: string }
  | { status: "revealed"; data: TPamAccountCredentialsResponse };

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

export const useCredentialsReveal = (accountId: string) => {
  const [state, setState] = useState<RevealState>({ status: "hidden" });
  const mfaPopupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | undefined>();

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (mfaPopupRef.current && !mfaPopupRef.current.closed) {
      mfaPopupRef.current.close();
    }
  }, []);

  const fetchCredentials = useCallback(
    async (mfaSessionId?: string) => {
      const { data } = await apiRequest.get<TPamAccountCredentialsResponse>(
        `/api/v1/pam/accounts/${accountId}/credentials`,
        { params: mfaSessionId ? { mfaSessionId } : undefined }
      );
      return data;
    },
    [accountId]
  );

  const startMfaPolling = useCallback(
    (mfaSessionId: string) => {
      const startTime = Date.now();

      pollIntervalRef.current = setInterval(async () => {
        if (Date.now() - startTime > MFA_TIMEOUT) {
          clearInterval(pollIntervalRef.current);
          setState({ status: "error", message: "MFA verification timed out." });
          return;
        }

        try {
          const resp = await apiRequest.get<TMfaSessionStatusResponse>(
            `/api/v2/mfa-sessions/${mfaSessionId}/status`
          );
          if (resp.data.status === MfaSessionStatus.ACTIVE) {
            clearInterval(pollIntervalRef.current);
            if (mfaPopupRef.current && !mfaPopupRef.current.closed) {
              mfaPopupRef.current.close();
            }

            setState({ status: "loading" });
            try {
              const data = await fetchCredentials(mfaSessionId);
              setState({ status: "revealed", data });
            } catch {
              setState({
                status: "error",
                message: "Failed to fetch credentials after MFA verification."
              });
            }
          }
        } catch {
          clearInterval(pollIntervalRef.current);
          setState({ status: "error", message: "MFA verification failed." });
        }
      }, MFA_POLL_INTERVAL);
    },
    [fetchCredentials]
  );

  const startReveal = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const data = await fetchCredentials();
      setState({ status: "revealed", data });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error === "SESSION_MFA_REQUIRED") {
        const mfaSessionId = err.response.data.details?.mfaSessionId as string | undefined;

        if (!mfaSessionId) {
          setState({ status: "error", message: "MFA session could not be created." });
          return;
        }

        // Immediately open MFA popup and start polling
        const mfaUrl = `${window.location.origin}/mfa-session/${mfaSessionId}`;
        mfaPopupRef.current = window.open(mfaUrl, "_blank");
        setState({ status: "mfa-verifying" });
        startMfaPolling(mfaSessionId);
      } else {
        setState({ status: "error", message: "Failed to fetch credentials." });
      }
    }
  }, [fetchCredentials, startMfaPolling]);

  const reset = useCallback(() => {
    cleanup();
    setState({ status: "hidden" });
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { state, startReveal, reset };
};

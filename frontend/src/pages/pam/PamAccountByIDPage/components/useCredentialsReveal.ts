import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";
import { TPamAccountCredentialsResponse } from "@app/hooks/api/pam/queries";

export type RevealState =
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "mfa-verifying" }
  | { status: "revealed"; data: TPamAccountCredentialsResponse };

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

export const useCredentialsReveal = (accountId: string) => {
  const [state, setState] = useState<RevealState>({ status: "hidden" });
  const mfaPopupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | undefined>();
  const isPollingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (mfaPopupRef.current && !mfaPopupRef.current.closed) {
      mfaPopupRef.current.close();
    }
    isPollingRef.current = false;
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
        if (isPollingRef.current) return;
        isPollingRef.current = true;

        try {
          if (Date.now() - startTime > MFA_TIMEOUT) {
            clearInterval(pollIntervalRef.current);
            createNotification({
              type: "error",
              text: "MFA verification timed out. If a popup did not appear, check that popups are not blocked for this site."
            });
            setState({ status: "hidden" });
            return;
          }

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
              createNotification({
                type: "error",
                text: "Failed to fetch credentials after MFA verification."
              });
              setState({ status: "hidden" });
            }
          }
        } catch {
          clearInterval(pollIntervalRef.current);
          createNotification({ type: "error", text: "MFA verification failed." });
          setState({ status: "hidden" });
        } finally {
          isPollingRef.current = false;
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
          createNotification({ type: "error", text: "MFA session could not be created." });
          setState({ status: "hidden" });
          return;
        }

        // Immediately open MFA popup and start polling
        const mfaUrl = `${window.location.origin}/mfa-session/${mfaSessionId}`;
        mfaPopupRef.current = window.open(mfaUrl, "_blank");

        if (!mfaPopupRef.current) {
          createNotification({
            type: "error",
            text: "Could not open MFA popup. Please allow popups for this site."
          });
          setState({ status: "hidden" });
          return;
        }

        setState({ status: "mfa-verifying" });
        startMfaPolling(mfaSessionId);
      } else {
        createNotification({ type: "error", text: "Failed to fetch credentials." });
        setState({ status: "hidden" });
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

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

// Fetches or rotates the recovery codes. When the backend requires a fresh MFA
// challenge it responds with SESSION_MFA_REQUIRED; the same fetcher is then
// retried with the verified mfaSessionId.
type CodesFetcher = (mfaSessionId?: string) => Promise<string[]>;

/**
 * Drives the step-up MFA flow used to view or regenerate recovery codes. Since
 * both actions expose a login second factor, the backend only serves them once a
 * fresh MFA session is ACTIVE. This mirrors the PAM credentials-reveal flow: open
 * the shared /mfa-session popup, poll its status, and replay the original request
 * with the verified session id.
 *
 * Once verified, the session id is remembered and reused for subsequent view/
 * rotate actions for the remainder of its ~5 min TTL, so the user isn't
 * re-challenged on every click. When the backend reports the session is no longer
 * valid (expired), it responds with SESSION_MFA_REQUIRED again and we transparently
 * re-run the popup challenge.
 */
export const useRecoveryCodesMfa = () => {
  const [isBusy, setIsBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const isPollingRef = useRef(false);
  // The most recently verified MFA session id, reused until the backend rejects it.
  const activeSessionIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    isPollingRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startMfaPolling = useCallback((mfaSessionId: string, fetcher: CodesFetcher) => {
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
          setIsBusy(false);
          return;
        }

        const resp = await apiRequest.get<TMfaSessionStatusResponse>(
          `/api/v2/mfa-sessions/${mfaSessionId}/status`
        );

        if (resp.data.status === MfaSessionStatus.ACTIVE) {
          clearInterval(pollIntervalRef.current);
          if (popupRef.current && !popupRef.current.closed) popupRef.current.close();

          try {
            const result = await fetcher(mfaSessionId);
            activeSessionIdRef.current = mfaSessionId;
            setCodes(result);
            setIsSheetOpen(true);
          } catch {
            createNotification({
              type: "error",
              text: "Failed to load recovery codes after verification."
            });
          } finally {
            setIsBusy(false);
          }
          return;
        }

        if (popupRef.current?.closed) {
          clearInterval(pollIntervalRef.current);
          createNotification({
            type: "error",
            text: "MFA verification was not completed. Verify again to view or rotate your recovery codes."
          });
          setIsBusy(false);
        }
      } catch {
        clearInterval(pollIntervalRef.current);
        createNotification({ type: "error", text: "MFA verification failed." });
        setIsBusy(false);
      } finally {
        isPollingRef.current = false;
      }
    }, MFA_POLL_INTERVAL);
  }, []);

  const run = useCallback(
    async (fetcher: CodesFetcher) => {
      setIsBusy(true);
      try {
        const result = await fetcher(activeSessionIdRef.current ?? undefined);
        setCodes(result);
        setIsSheetOpen(true);
        setIsBusy(false);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data?.error === "SESSION_MFA_REQUIRED") {
          activeSessionIdRef.current = null;
          const mfaSessionId = err.response.data.details?.mfaSessionId as string | undefined;

          if (!mfaSessionId) {
            createNotification({ type: "error", text: "MFA session could not be created." });
            setIsBusy(false);
            return;
          }

          popupRef.current = window.open(
            `${window.location.origin}/mfa-session/${mfaSessionId}`,
            "_blank"
          );

          if (!popupRef.current) {
            createNotification({
              type: "error",
              text: "Could not open MFA popup. Please allow popups for this site."
            });
            setIsBusy(false);
            return;
          }

          startMfaPolling(mfaSessionId, fetcher);
        } else {
          createNotification({
            type: "error",
            text:
              (axios.isAxiosError(err) && err.response?.data?.message) ||
              "Failed to load recovery codes."
          });
          setIsBusy(false);
        }
      }
    },
    [startMfaPolling]
  );

  const viewCodes = useCallback(
    () =>
      run(async (mfaSessionId) => {
        const { data } = await apiRequest.get<{ recoveryCodes: string[] }>(
          "/api/v1/user/me/mfa/recovery-codes",
          { params: mfaSessionId ? { mfaSessionId } : undefined }
        );
        return data.recoveryCodes;
      }),
    [run]
  );

  const regenerateCodes = useCallback(
    () =>
      run(async (mfaSessionId) => {
        const { data } = await apiRequest.post<{ recoveryCodes: string[] }>(
          "/api/v1/user/me/mfa/recovery-codes",
          mfaSessionId ? { mfaSessionId } : {}
        );
        createNotification({
          type: "success",
          text: "Generated new recovery codes. Your previous codes no longer work."
        });
        return data.recoveryCodes;
      }),
    [run]
  );

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
    setCodes(null);
  }, []);

  return { isBusy, codes, isSheetOpen, closeSheet, viewCodes, regenerateCodes };
};

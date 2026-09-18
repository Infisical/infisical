import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { consumeMfaLockoutError } from "@app/helpers/mfaSession";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

// An action guarded by step-up MFA. It receives the verified session id (once
// available) so it can replay itself against the backend. When the backend
// requires a fresh challenge it responds with SESSION_MFA_REQUIRED, and the same
// action is retried with the verified mfaSessionId.
type StepUpAction<T> = (mfaSessionId?: string) => Promise<T>;

type RunOptions<T> = {
  onSuccess: (result: T) => void;
  // Fallback message when the action fails for a reason other than a backend
  // message (e.g. after verification).
  errorText?: string;
};

/**
 * Drives the step-up MFA flow shared by sensitive account actions (viewing or
 * rotating recovery codes, disabling MFA). Mirrors the PAM credentials-reveal
 * flow: run the action, and if the backend replies SESSION_MFA_REQUIRED, open the
 * shared /mfa-session popup, poll its status, and replay the action with the
 * verified session id.
 *
 * Reuse across subsequent actions is handled entirely by the backend: completing a
 * management challenge (like a full login) opens a short recent-MFA-auth grace window,
 * so the next action's first attempt (sent with no session id) succeeds without a
 * fresh challenge until the window elapses. This hook therefore keeps no client-side
 * session cache; it only tracks the in-flight challenge. Callers own their result/UI
 * state; this hook owns the challenge.
 */
export const useMfaStepUp = () => {
  const [isBusy, setIsBusy] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const isPollingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    isPollingRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startMfaPolling = useCallback(
    <T>(mfaSessionId: string, action: StepUpAction<T>, opts: RunOptions<T>) => {
      const startTime = Date.now();

      pollIntervalRef.current = setInterval(async () => {
        if (isPollingRef.current) return;
        isPollingRef.current = true;

        try {
          if (Date.now() - startTime > MFA_TIMEOUT) {
            clearInterval(pollIntervalRef.current);
            if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
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
              const result = await action(mfaSessionId);
              opts.onSuccess(result);
            } catch {
              createNotification({
                type: "error",
                text: opts.errorText ?? "Action failed after verification."
              });
            } finally {
              setIsBusy(false);
            }
            return;
          }

          if (popupRef.current?.closed) {
            clearInterval(pollIntervalRef.current);
            const lockoutMessage = consumeMfaLockoutError(mfaSessionId);
            createNotification({
              type: "error",
              text:
                lockoutMessage ??
                "MFA verification was not completed. Please verify again to continue."
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
    },
    []
  );

  const runWithMfa = useCallback(
    async <T>(action: StepUpAction<T>, opts: RunOptions<T>) => {
      setIsBusy(true);
      try {
        const result = await action();
        opts.onSuccess(result);
        setIsBusy(false);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data?.error === "SESSION_MFA_REQUIRED") {
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

          startMfaPolling(mfaSessionId, action, opts);
        } else {
          createNotification({
            type: "error",
            text:
              (axios.isAxiosError(err) && err.response?.data?.message) ||
              opts.errorText ||
              "Action failed."
          });
          setIsBusy(false);
        }
      }
    },
    [startMfaPolling]
  );

  return { isBusy, runWithMfa };
};

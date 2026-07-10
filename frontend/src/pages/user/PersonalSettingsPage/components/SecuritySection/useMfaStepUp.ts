import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { consumeMfaLockoutError } from "@app/helpers/mfaSession";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

// The most recently verified step-up MFA session id, shared across every
// useMfaStepUp instance. The MFA-management actions (view/rotate recovery codes,
// disable MFA) live in sibling components with their own hook instances but the
// backend accepts one step-up session for all of them, so remembering the id in
// module scope lets a challenge completed for one action satisfy the next until it
// expires. It never drives rendering, and a stale id (e.g. after logout) is
// harmless: the backend rejects it and a fresh challenge transparently re-runs.
const sharedStepUpSession = { id: null as string | null };

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
 * A verified session id is remembered and reused for subsequent actions until the
 * backend rejects it (expired), at which point the popup challenge transparently
 * re-runs. Callers own their own result/UI state; this hook owns the challenge.
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
              sharedStepUpSession.id = mfaSessionId;
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
        const result = await action(sharedStepUpSession.id ?? undefined);
        opts.onSuccess(result);
        setIsBusy(false);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data?.error === "SESSION_MFA_REQUIRED") {
          sharedStepUpSession.id = null;
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

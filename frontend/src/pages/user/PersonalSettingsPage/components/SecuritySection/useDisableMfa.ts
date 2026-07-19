import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { userKeys } from "@app/hooks/api/users/query-keys";

import { useMfaStepUp } from "./useMfaStepUp";

/**
 * Disabling MFA weakens account security, so it is gated behind a fresh step-up
 * MFA challenge (the same primitive used to view/rotate recovery codes). This
 * wraps the shared {@link useMfaStepUp} driver with the deactivate request. It
 * calls apiRequest directly (rather than a mutation) so the expected
 * SESSION_MFA_REQUIRED 400 doesn't surface a global mutation error toast.
 */
export const useDisableMfa = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();

  const disableMfa = useCallback(
    (onDisabled?: () => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          await apiRequest.post(
            "/api/v2/users/me/mfa/deactivate",
            mfaSessionId ? { mfaSessionId } : {}
          );
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.getUser });
            queryClient.invalidateQueries({ queryKey: userKeys.mfaRecoveryCodes });
            createNotification({
              text: "Two-factor authentication disabled",
              type: "success"
            });
            onDisabled?.();
          },
          errorText: "Failed to disable two-factor authentication"
        }
      ),
    [runWithMfa, queryClient]
  );

  return { isBusy, disableMfa };
};

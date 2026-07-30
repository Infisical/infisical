import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { userKeys } from "@app/hooks/api/users/query-keys";

import { useMfaStepUp } from "./useMfaStepUp";

/**
 * Removing the authenticator app weakens a login second factor, so it is gated
 * behind a fresh step-up MFA challenge (the same primitive used to view/rotate
 * recovery codes). Calls apiRequest directly (rather than a mutation) so the
 * expected SESSION_MFA_REQUIRED 400 doesn't surface a global mutation error toast.
 */
export const useRemoveTotp = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();

  const removeTotp = useCallback(
    (onRemoved?: () => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          await apiRequest.delete("/api/v1/user/me/totp", {
            params: mfaSessionId ? { mfaSessionId } : undefined
          });
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration });
            queryClient.removeQueries({ queryKey: userKeys.totpRegistration });
            queryClient.invalidateQueries({ queryKey: userKeys.getUser });
            createNotification({ text: "Authenticator app removed", type: "success" });
            onRemoved?.();
          },
          errorText: "Failed to remove authenticator app"
        }
      ),
    [runWithMfa, queryClient]
  );

  return { isBusy, removeTotp };
};

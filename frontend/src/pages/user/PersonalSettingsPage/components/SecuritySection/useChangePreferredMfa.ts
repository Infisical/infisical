import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { userKeys } from "@app/hooks/api/users/query-keys";

import { useMfaStepUp } from "./useMfaStepUp";

/**
 * Changing the preferred second factor is a sensitive account action, so it is
 * gated behind a fresh step-up MFA challenge (the same primitive used to
 * view/rotate recovery codes). Calls apiRequest directly (rather than a mutation)
 * so the expected SESSION_MFA_REQUIRED 400 doesn't surface a global mutation error
 * toast.
 */
export const useChangePreferredMfa = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();

  const changePreferredMfa = useCallback(
    (selectedMfaMethod: MfaMethod) =>
      runWithMfa(
        async (mfaSessionId) => {
          await apiRequest.patch("/api/v2/users/me/mfa", {
            selectedMfaMethod,
            ...(mfaSessionId ? { mfaSessionId } : {})
          });
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.getUser });
            createNotification({ text: "Updated preferred 2FA method", type: "success" });
          },
          errorText: "Failed to update preferred method"
        }
      ),
    [runWithMfa, queryClient]
  );

  return { isBusy, changePreferredMfa };
};

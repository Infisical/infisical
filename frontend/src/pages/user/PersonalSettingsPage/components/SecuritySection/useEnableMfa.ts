import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { userKeys } from "@app/hooks/api/users/query-keys";

import { useMfaStepUp } from "./useMfaStepUp";

/**
 * Enabling MFA turns on a second factor the user selected beforehand, so it is
 * gated behind a fresh step-up MFA challenge against that method. This proves the
 * user can actually satisfy the factor they are about to enforce (so they can't
 * lock themselves out) and mirrors the disable flow. It calls apiRequest directly
 * (rather than a mutation) so the expected SESSION_MFA_REQUIRED 400 doesn't surface
 * a global mutation error toast. The fresh recovery codes are handed back to the
 * caller so they can be shown once.
 */
export const useEnableMfa = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();

  const enableMfa = useCallback(
    (selectedMfaMethod: MfaMethod, onEnabled?: (recoveryCodes: string[]) => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          const { data } = await apiRequest.post<{ recoveryCodes: string[] }>(
            "/api/v2/users/me/mfa/activate",
            { selectedMfaMethod, ...(mfaSessionId ? { mfaSessionId } : {}) }
          );
          return data.recoveryCodes;
        },
        {
          onSuccess: (recoveryCodes) => {
            queryClient.invalidateQueries({ queryKey: userKeys.getUser });
            queryClient.invalidateQueries({ queryKey: userKeys.mfaRecoveryCodes });
            createNotification({
              text: "Two-factor authentication enabled",
              type: "success"
            });
            onEnabled?.(recoveryCodes);
          },
          errorText: "Failed to enable two-factor authentication"
        }
      ),
    [runWithMfa, queryClient]
  );

  return { isBusy, enableMfa };
};

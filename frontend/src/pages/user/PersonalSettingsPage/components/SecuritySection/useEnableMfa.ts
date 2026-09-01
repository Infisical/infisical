import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { userKeys } from "@app/hooks/api/users/query-keys";

import { useMfaStepUp } from "./useMfaStepUp";

/**
 * Enabling MFA mints an account-wide recovery-code pool, and those codes bypass any
 * org-enforced MFA at login. A session that has not itself proven a second factor
 * (isMfaVerified=false — e.g. a token from an org that does not enforce MFA) must
 * therefore pass a fresh step-up challenge against the method being enabled before
 * the backend issues codes. This wraps the shared {@link useMfaStepUp} driver with
 * the activate request and surfaces the freshly minted recovery codes once.
 *
 * Calls apiRequest directly (rather than a mutation) so the expected
 * SESSION_MFA_REQUIRED 400 doesn't surface a global mutation error toast.
 */
export const useEnableMfa = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();

  const enableMfa = useCallback(
    (selectedMfaMethod: MfaMethod, onEnabled: (recoveryCodes: string[]) => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          const { data } = await apiRequest.post<{ recoveryCodes: string[] }>(
            "/api/v2/users/me/mfa/activate",
            {
              selectedMfaMethod,
              ...(mfaSessionId ? { mfaSessionId } : {})
            }
          );
          return data.recoveryCodes;
        },
        {
          onSuccess: (recoveryCodes) => {
            queryClient.invalidateQueries({ queryKey: userKeys.getUser });
            queryClient.invalidateQueries({ queryKey: userKeys.mfaRecoveryCodes });
            onEnabled(recoveryCodes);
          },
          errorText: "Failed to enable two-factor authentication"
        }
      ),
    [runWithMfa, queryClient]
  );

  return { isBusy, enableMfa };
};

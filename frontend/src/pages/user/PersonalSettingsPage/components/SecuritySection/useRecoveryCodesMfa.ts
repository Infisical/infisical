import { useCallback, useState } from "react";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

import { useMfaStepUp } from "./useMfaStepUp";

/**
 * Viewing and rotating recovery codes both expose a login second factor, so the
 * backend only serves them once a fresh step-up MFA session is ACTIVE. This wraps
 * the shared {@link useMfaStepUp} driver with the recovery-code specific requests
 * and sheet state.
 */
export const useRecoveryCodesMfa = () => {
  const { isBusy, runWithMfa } = useMfaStepUp();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const showCodes = useCallback((result: string[]) => {
    setCodes(result);
    setIsSheetOpen(true);
  }, []);

  const viewCodes = useCallback(
    () =>
      runWithMfa(
        async (mfaSessionId) => {
          const { data } = await apiRequest.get<{ recoveryCodes: string[] }>(
            "/api/v1/user/me/mfa/recovery-codes",
            { params: mfaSessionId ? { mfaSessionId } : undefined }
          );
          return data.recoveryCodes;
        },
        { onSuccess: showCodes, errorText: "Failed to load recovery codes." }
      ),
    [runWithMfa, showCodes]
  );

  const regenerateCodes = useCallback(
    () =>
      runWithMfa(
        async (mfaSessionId) => {
          const { data } = await apiRequest.post<{ recoveryCodes: string[] }>(
            "/api/v1/user/me/mfa/recovery-codes",
            mfaSessionId ? { mfaSessionId } : {}
          );
          return data.recoveryCodes;
        },
        {
          onSuccess: (result) => {
            createNotification({
              type: "success",
              text: "Generated new recovery codes. Your previous codes no longer work."
            });
            showCodes(result);
          },
          errorText: "Failed to load recovery codes."
        }
      ),
    [runWithMfa, showCodes]
  );

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
    setCodes(null);
  }, []);

  return { isBusy, codes, isSheetOpen, closeSheet, viewCodes, regenerateCodes };
};

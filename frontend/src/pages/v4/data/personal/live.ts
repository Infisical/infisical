import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { jwtDecode } from "jwt-decode";

import { toast } from "@app/components/v4/ui/sonner";
import { apiRequest } from "@app/config/request";
import { useServerConfig } from "@app/context";
import { consumeMfaLockoutError } from "@app/helpers/mfaSession";
import { useResetUserPasswordV2, useSendPasswordSetupEmail } from "@app/hooks/api/auth/queries";
import type { MfaMethod } from "@app/hooks/api/auth/types";
import { MfaSessionStatus, type TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";
import { useGetOrganizations } from "@app/hooks/api/organization/queries";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import {
  useRequestEmailChangeOTP,
  useRevokeMySessionById,
  useUpdateUserEmail,
  useVerifyCurrentEmailOTP
} from "@app/hooks/api/users/mutation";
import {
  clearSession,
  useDeleteMe,
  useEnrollMfa,
  useGetMyDeletionEligibility,
  useGetMySessions,
  useGetUser,
  useGetUserTotpConfiguration,
  useGetUserTotpRegistration,
  useRenameUser,
  useRevokeMySessions,
  useUpdateUserAuthMethods
} from "@app/hooks/api/users/queries";
import { userKeys } from "@app/hooks/api/users/query-keys";
import type { AuthMethod } from "@app/hooks/api/users/types";
import { useGetWebAuthnCredentials, useRegisterPasskey } from "@app/hooks/api/webauthn";
import { webAuthnKeys } from "@app/hooks/api/webauthn/queries";

import type { PersonalAdapter, PersonalUser } from "./contract";

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

type Action<T> = (mfaSessionId?: string) => Promise<T>;

const useMfaStepUp = () => {
  const [isBusy, setIsBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const pollingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    pollingRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const poll = useCallback(
    <T>(
      mfaSessionId: string,
      action: Action<T>,
      onSuccess: (result: T) => void,
      errorText: string
    ) => {
      const startedAt = Date.now();
      const stop = (message?: string) => {
        clearInterval(pollRef.current);
        if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
        if (message) toast.error(message);
        setIsBusy(false);
      };
      pollRef.current = setInterval(async () => {
        if (pollingRef.current) return;
        pollingRef.current = true;
        try {
          if (Date.now() - startedAt > MFA_TIMEOUT) {
            stop(
              "MFA verification timed out. If a popup did not appear, check that popups are not blocked for this site."
            );
            return;
          }
          const { data } = await apiRequest.get<TMfaSessionStatusResponse>(
            `/api/v2/mfa-sessions/${mfaSessionId}/status`
          );
          if (data.status === MfaSessionStatus.ACTIVE) {
            stop();
            setIsBusy(true);
            try {
              onSuccess(await action(mfaSessionId));
            } catch {
              toast.error(errorText);
            } finally {
              setIsBusy(false);
            }
            return;
          }
          if (popupRef.current?.closed) {
            stop(
              consumeMfaLockoutError(mfaSessionId) ??
                "MFA verification was not completed. Verify again to continue."
            );
          }
        } catch {
          stop("MFA verification failed.");
        } finally {
          pollingRef.current = false;
        }
      }, MFA_POLL_INTERVAL);
    },
    []
  );

  const runWithMfa = useCallback(
    async <T>(action: Action<T>, onSuccess: (result: T) => void, errorText: string) => {
      setIsBusy(true);
      try {
        onSuccess(await action());
        setIsBusy(false);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.data?.error === "SESSION_MFA_REQUIRED") {
          const mfaSessionId = error.response.data.details?.mfaSessionId as string | undefined;
          if (!mfaSessionId) {
            toast.error("MFA session could not be created.");
            setIsBusy(false);
            return;
          }
          popupRef.current = window.open(
            `${window.location.origin}/mfa-session/${mfaSessionId}`,
            "_blank"
          );
          if (!popupRef.current) {
            toast.error("Could not open the MFA popup. Allow popups for this site.");
            setIsBusy(false);
            return;
          }
          poll(mfaSessionId, action, onSuccess, errorText);
          return;
        }
        toast.error((axios.isAxiosError(error) && error.response?.data?.message) || errorText);
        setIsBusy(false);
      }
    },
    [poll]
  );

  return { isBusy, runWithMfa };
};

const withMfaSession = (mfaSessionId?: string) => (mfaSessionId ? { mfaSessionId } : {});

const useEnableMfa: PersonalAdapter["useEnableMfa"] = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();
  return {
    isBusy,
    run: (method: MfaMethod, onEnabled: (recoveryCodes: string[]) => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          const { data } = await apiRequest.post<{ recoveryCodes: string[] }>(
            "/api/v2/users/me/mfa/activate",
            { selectedMfaMethod: method, ...withMfaSession(mfaSessionId) }
          );
          return data.recoveryCodes;
        },
        (recoveryCodes) => {
          queryClient.invalidateQueries({ queryKey: userKeys.getUser });
          queryClient.invalidateQueries({ queryKey: userKeys.mfaRecoveryCodes });
          onEnabled(recoveryCodes);
        },
        "Failed to enable two-factor authentication"
      )
  };
};

const useDisableMfa: PersonalAdapter["useDisableMfa"] = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();
  return {
    isBusy,
    run: (onDisabled: () => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          await apiRequest.post("/api/v2/users/me/mfa/deactivate", withMfaSession(mfaSessionId));
        },
        () => {
          queryClient.invalidateQueries({ queryKey: userKeys.getUser });
          queryClient.invalidateQueries({ queryKey: userKeys.mfaRecoveryCodes });
          toast.success("Two-factor authentication disabled");
          onDisabled();
        },
        "Failed to disable two-factor authentication"
      )
  };
};

const useChangePreferredMfa: PersonalAdapter["useChangePreferredMfa"] = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();
  return {
    isBusy,
    run: (method: MfaMethod) =>
      runWithMfa(
        async (mfaSessionId) => {
          await apiRequest.patch("/api/v2/users/me/mfa", {
            selectedMfaMethod: method,
            ...withMfaSession(mfaSessionId)
          });
        },
        () => {
          queryClient.invalidateQueries({ queryKey: userKeys.getUser });
          toast.success("Updated preferred 2FA method");
        },
        "Failed to update preferred method"
      )
  };
};

const useRemoveTotp: PersonalAdapter["useRemoveTotp"] = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();
  return {
    isBusy,
    run: (onRemoved: () => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          await apiRequest.delete("/api/v1/user/me/totp", { params: withMfaSession(mfaSessionId) });
        },
        () => {
          queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration });
          queryClient.removeQueries({ queryKey: userKeys.totpRegistration });
          queryClient.invalidateQueries({ queryKey: userKeys.getUser });
          toast.success("Authenticator app removed");
          onRemoved();
        },
        "Failed to remove authenticator app"
      )
  };
};

const useRemovePasskey: PersonalAdapter["useRemovePasskey"] = () => {
  const queryClient = useQueryClient();
  const { isBusy, runWithMfa } = useMfaStepUp();
  return {
    isBusy,
    run: (id: string, onRemoved: () => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          await apiRequest.delete(`/api/v1/user/me/webauthn/${id}`, {
            params: withMfaSession(mfaSessionId)
          });
        },
        () => {
          queryClient.invalidateQueries({ queryKey: webAuthnKeys.credentials });
          queryClient.invalidateQueries({ queryKey: userKeys.getUser });
          toast.success("Passkey removed");
          onRemoved();
        },
        "Failed to remove passkey"
      )
  };
};

const useRecoveryCodes: PersonalAdapter["useRecoveryCodes"] = () => {
  const { isBusy, runWithMfa } = useMfaStepUp();
  return {
    isBusy,
    run: (mode: "view" | "regenerate", onCodes: (recoveryCodes: string[]) => void) =>
      runWithMfa(
        async (mfaSessionId) => {
          const { data } =
            mode === "view"
              ? await apiRequest.get<{ recoveryCodes: string[] }>(
                  "/api/v1/user/me/mfa/recovery-codes",
                  { params: withMfaSession(mfaSessionId) }
                )
              : await apiRequest.post<{ recoveryCodes: string[] }>(
                  "/api/v1/user/me/mfa/recovery-codes",
                  withMfaSession(mfaSessionId)
                );
          return data.recoveryCodes;
        },
        (recoveryCodes) => {
          if (mode === "regenerate")
            toast.success("Generated new recovery codes. Your previous codes no longer work.");
          onCodes(recoveryCodes);
        },
        "Failed to load recovery codes."
      )
  };
};

export const personalLive: PersonalAdapter = {
  useUser: () => useGetUser() as ReturnType<PersonalAdapter["useUser"]> & { data?: PersonalUser },
  useServerConfig: () => useServerConfig().config,
  useServerStatus: useFetchServerStatus,
  useOrganizations: useGetOrganizations,
  useTotpConfiguration: useGetUserTotpConfiguration,
  useWebAuthnCredentials: useGetWebAuthnCredentials,
  useSessions: useGetMySessions,
  getCurrentAuthMethod: () => {
    const authToken = getAuthToken();
    if (!authToken) return undefined;
    try {
      return jwtDecode<{ authMethod?: AuthMethod }>(authToken).authMethod;
    } catch {
      return undefined;
    }
  },
  useRenameUser,
  useUpdateAuthMethods: useUpdateUserAuthMethods,
  useRevokeSession: useRevokeMySessionById,
  useRevokeAllSessions: useRevokeMySessions,
  useDeletionEligibility: () => useGetMyDeletionEligibility({ enabled: false }),
  useDeleteMe,
  useRequestEmailChange: useRequestEmailChangeOTP,
  useVerifyCurrentEmail: useVerifyCurrentEmailOTP,
  useUpdateEmail: useUpdateUserEmail,
  useChangePassword: useResetUserPasswordV2,
  useSendPasswordSetupEmail,
  useEnableMfa,
  useDisableMfa,
  useChangePreferredMfa,
  useRemoveTotp,
  useRemovePasskey,
  useRecoveryCodes,
  useTotpRegistration: useGetUserTotpRegistration,
  useEnrollMfa,
  useRegisterPasskey,
  endSession: clearSession
};

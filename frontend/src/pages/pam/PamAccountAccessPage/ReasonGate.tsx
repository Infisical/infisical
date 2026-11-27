import { createContext, Fragment, ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Laptop, ShieldCheck } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  TextArea
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession/types";
import { PAM_DEVICE_VERIFICATION_REQUIRED, PamPolicyType, TPamAccount } from "@app/hooks/api/pam";
import { getAccessErrorMessage } from "@app/pages/pam/access-error";
import { DeviceVerification } from "@app/pages/pam/components/DeviceVerification";

type TPamDeviceVerificationContext = {
  deviceVerificationId?: string;
  // Sends the user back to the device step, for a check that expired or a grant approved for one device
  requestDeviceCheck: () => void;
};

export const PamDeviceVerificationContext = createContext<TPamDeviceVerificationContext>({
  requestDeviceCheck: () => {}
});

export const isDeviceVerificationRequired = (err: unknown) =>
  (err as { response?: { data?: { details?: { code?: string } } } })?.response?.data?.details
    ?.code === PAM_DEVICE_VERIFICATION_REQUIRED;

type TAccessPolicy = {
  requireReason: boolean;
  maxSessionDurationSeconds: number;
  requireMfa: boolean;
  requireDevicePosture: boolean;
  requiresApproval: boolean;
};

export const resolveAccessPolicy = (account: TPamAccount): TAccessPolicy => {
  const policies = (account.templatePolicies ?? {}) as Record<string, unknown>;
  const duration = policies[PamPolicyType.MaxSessionDuration];
  return {
    requireReason: policies[PamPolicyType.RequireReason] === true,
    requireMfa: policies[PamPolicyType.RequireMfa] === true,
    requireDevicePosture: Boolean(policies[PamPolicyType.DevicePosture]),
    requiresApproval: policies[PamPolicyType.RequiresApproval] === true,
    maxSessionDurationSeconds: typeof duration === "number" ? duration : 3600
  };
};

const DeviceCheckCard = ({
  account,
  isBound,
  onVerified
}: {
  account: TPamAccount;
  isBound: boolean;
  onVerified: (verificationId: string) => void;
}) => (
  <div className="flex h-dvh w-screen items-center justify-center bg-background p-4">
    <Card className="w-full max-w-md">
      <CardHeader className="flex items-center gap-3">
        <Laptop className="size-6 shrink-0 text-product-pam" />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-base">Device Verification Required</CardTitle>
          <CardDescription>
            {isBound
              ? `Your access to ${account.name} was approved for one device. Check that you're on it.`
              : `${account.name} requires a managed device that passes your organization's device policy.`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <DeviceVerification accountId={account.id} autoStart onVerified={onVerified} />
      </CardContent>
    </Card>
  </div>
);

// For flows with their own reason and MFA steps, which only need the device check
export const DevicePostureGate = ({
  account,
  children
}: {
  account: TPamAccount;
  children: ReactNode;
}) => {
  const policy = resolveAccessPolicy(account);
  const [needsCheck, setNeedsCheck] = useState(policy.requireDevicePosture);
  const [isBound, setIsBound] = useState(false);
  const [deviceVerificationId, setDeviceVerificationId] = useState<string>();

  const requestDeviceCheck = useCallback(() => {
    setDeviceVerificationId(undefined);
    setIsBound(!policy.requireDevicePosture);
    setNeedsCheck(true);
  }, [policy.requireDevicePosture]);
  const deviceContext = useMemo(
    () => ({ deviceVerificationId, requestDeviceCheck }),
    [deviceVerificationId, requestDeviceCheck]
  );

  if (needsCheck) {
    return (
      <DeviceCheckCard
        account={account}
        isBound={isBound}
        onVerified={(verificationId) => {
          setDeviceVerificationId(verificationId);
          setTimeout(() => setNeedsCheck(false), 1500);
        }}
      />
    );
  }

  return (
    <PamDeviceVerificationContext.Provider value={deviceContext}>
      <Fragment key={deviceVerificationId}>{children}</Fragment>
    </PamDeviceVerificationContext.Provider>
  );
};

type TSessionAccessGateResult = {
  reason?: string;
  mfaSessionId?: string;
  deviceVerificationId?: string;
};

type Props = {
  account: TPamAccount;
  children: (result: TSessionAccessGateResult) => ReactNode;
};

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

export const SessionAccessGate = ({ account, children }: Props) => {
  const policy = resolveAccessPolicy(account);

  const [step, setStep] = useState<"reason" | "device" | "mfa" | "done" | "error">("reason");
  const [deviceVerificationId, setDeviceVerificationId] = useState<string>();
  const [isBound, setIsBound] = useState(false);
  const [reason, setReason] = useState("");
  const deviceContext = useMemo(
    () => ({
      deviceVerificationId,
      requestDeviceCheck: () => {
        setDeviceVerificationId(undefined);
        setIsBound(!policy.requireDevicePosture);
        setStep("device");
      }
    }),
    [deviceVerificationId, policy.requireDevicePosture]
  );
  const [mfaSessionId, setMfaSessionId] = useState<string>();
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const popupRef = useRef<Window | null>(null);

  const continueToMfa = useCallback(
    async (verificationId?: string) => {
      const trimmed = reason.trim();

      // A grant approved for one device needs a device check too, which only the server knows about
      const mayNeedDevice =
        policy.requiresApproval && !verificationId && !policy.requireDevicePosture;
      if (!policy.requireMfa && !mayNeedDevice) {
        setStep("done");
        return;
      }

      if (policy.requireMfa) setStep("mfa");

      try {
        await apiRequest.post<{ ticket: string }>(
          `/api/v1/pam/accounts/${account.id}/web-access-ticket`,
          { reason: trimmed || undefined, deviceVerificationId: verificationId }
        );
        setStep("done");
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: {
            data?: {
              error?: string;
              details?: { mfaSessionId?: string; mfaMethod?: string; code?: string };
            };
          };
        };

        if (isDeviceVerificationRequired(err)) {
          setIsBound(!policy.requireDevicePosture);
          setStep("device");
          return;
        }

        if (axiosErr?.response?.data?.error === "SESSION_MFA_REQUIRED") {
          const sessionId = axiosErr.response!.data!.details?.mfaSessionId;
          if (sessionId) {
            setMfaSessionId(sessionId);
            return;
          }
        }

        setErrorMessage(getAccessErrorMessage(err, "Failed to access account. Please try again."));
        setStep("error");
      }
    },
    [reason, policy.requireMfa, policy.requireDevicePosture, account.id, policy.requiresApproval]
  );

  const handleReasonSubmit = useCallback(() => {
    if (policy.requireDevicePosture) {
      setStep("device");
      return;
    }
    continueToMfa();
  }, [policy.requireDevicePosture, continueToMfa]);

  const handleMfaVerify = useCallback(async () => {
    if (!mfaSessionId) return;

    setMfaVerifying(true);

    const mfaUrl = `${window.location.origin}/mfa-session/${mfaSessionId}`;
    popupRef.current = window.open(mfaUrl, "_blank");

    const startTime = Date.now();

    const verified = await new Promise<boolean>((resolve) => {
      const interval = setInterval(async () => {
        if (Date.now() - startTime > MFA_TIMEOUT) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        try {
          const resp = await apiRequest.get<TMfaSessionStatusResponse>(
            `/api/v2/mfa-sessions/${mfaSessionId}/status`
          );
          if (resp.data.status === MfaSessionStatus.ACTIVE) {
            clearInterval(interval);
            resolve(true);
          }
        } catch {
          clearInterval(interval);
          resolve(false);
        }
      }, MFA_POLL_INTERVAL);
    });

    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }

    if (verified) {
      setStep("done");
    } else {
      setMfaVerifying(false);
      setErrorMessage("MFA verification timed out or failed. Please try again.");
      setStep("error");
    }
  }, [mfaSessionId]);

  const handleRetry = () => {
    setErrorMessage("");
    setMfaSessionId(undefined);
    setMfaVerifying(false);
    setStep("reason");
  };

  if (step === "done") {
    const trimmed = reason.trim();
    return (
      <PamDeviceVerificationContext.Provider value={deviceContext}>
        <Fragment key={deviceVerificationId}>
          {children({ reason: trimmed || undefined, mfaSessionId, deviceVerificationId })}
        </Fragment>
      </PamDeviceVerificationContext.Provider>
    );
  }

  if (step === "error") {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-base">Access Failed</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="pam" isFullWidth onClick={handleRetry}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "device") {
    return (
      <DeviceCheckCard
        account={account}
        isBound={isBound}
        onVerified={(verificationId) => {
          setDeviceVerificationId(verificationId);
          setTimeout(() => continueToMfa(verificationId), 1500);
        }}
      />
    );
  }

  if (step === "mfa") {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="flex items-center gap-3">
            <ShieldCheck className="size-6 shrink-0 text-product-pam" />
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-base">MFA Verification Required</CardTitle>
              <CardDescription>
                Multi-factor authentication is required to access this account.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {mfaVerifying ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted">
                <Spinner size="xs" />
                Waiting for verification...
              </div>
            ) : (
              <Button variant="pam" isFullWidth onClick={handleMfaVerify}>
                Verify MFA
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // step === "reason"
  const trimmed = reason.trim();
  const canSubmit = !policy.requireReason || trimmed.length > 0;

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Before you continue</CardTitle>
          <CardDescription>
            {policy.requireReason
              ? "A reason is required for this session. It will be stored for audit purposes."
              : "Optionally provide a reason for this session. It will be stored for audit purposes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TextArea
            placeholder={
              policy.requireReason
                ? "e.g. Running migration for release 2.4"
                : "Optional, e.g. Running migration for release 2.4"
            }
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                if (canSubmit) handleReasonSubmit();
              }
            }}
          />
          <Button variant="pam" isFullWidth onClick={handleReasonSubmit} isDisabled={!canSubmit}>
            {!policy.requireReason && trimmed.length === 0 ? "Skip & Continue" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

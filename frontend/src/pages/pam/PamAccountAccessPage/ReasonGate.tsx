import { ReactNode, useCallback, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Spinner } from "@app/components/v2";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TextArea
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession/types";
import { PamPolicyType, TPamAccount } from "@app/hooks/api/pam";

type TAccessPolicy = {
  requireReason: boolean;
  maxSessionDurationSeconds: number;
  requireMfa: boolean;
};

export const resolveAccessPolicy = (account: TPamAccount): TAccessPolicy => {
  const policies = (account.templatePolicies ?? {}) as Record<string, unknown>;
  const duration = policies[PamPolicyType.MaxSessionDuration];
  return {
    requireReason: policies[PamPolicyType.RequireReason] === true,
    requireMfa: policies[PamPolicyType.RequireMfa] === true,
    maxSessionDurationSeconds: typeof duration === "number" ? duration : 3600
  };
};

type TSessionAccessGateResult = {
  reason?: string;
  mfaSessionId?: string;
};

type Props = {
  account: TPamAccount;
  children: (result: TSessionAccessGateResult) => ReactNode;
};

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

export const SessionAccessGate = ({ account, children }: Props) => {
  const policy = resolveAccessPolicy(account);

  const [step, setStep] = useState<"reason" | "mfa" | "done" | "error">("reason");
  const [reason, setReason] = useState("");
  const [mfaSessionId, setMfaSessionId] = useState<string>();
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const popupRef = useRef<Window | null>(null);

  const handleReasonSubmit = useCallback(async () => {
    const trimmed = reason.trim();

    if (!policy.requireMfa) {
      setStep("done");
      return;
    }

    setStep("mfa");

    try {
      await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${account.id}/web-access-ticket`,
        { reason: trimmed || undefined }
      );
      setStep("done");
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          data?: {
            error?: string;
            message?: string;
            details?: { mfaSessionId?: string; mfaMethod?: string };
          };
        };
      };

      if (axiosErr?.response?.data?.error === "SESSION_MFA_REQUIRED") {
        const sessionId = axiosErr.response!.data!.details?.mfaSessionId;
        if (sessionId) {
          setMfaSessionId(sessionId);
          return;
        }
      }

      setErrorMessage(
        axiosErr?.response?.data?.message ?? "Failed to access account. Please try again."
      );
      setStep("error");
    }
  }, [reason, policy.requireMfa, account.id]);

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
    return <>{children({ reason: trimmed || undefined, mfaSessionId })}</>;
  }

  if (step === "error") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
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

  if (step === "mfa") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
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
                <Spinner className="h-4 w-4" />
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
    <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Before You Continue</CardTitle>
          <CardDescription>
            {policy.requireReason
              ? "A reason is required for this session. It will be stored for audit purposes."
              : "Optionally provide a reason for this session. It will be stored for audit purposes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TextArea
            placeholder="Optional, e.g. Running migration for release 2.4"
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

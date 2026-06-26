import React, { useCallback, useRef, useState } from "react";
import { Loader2, ShieldAlert, TriangleAlert } from "lucide-react";

import { Button, Label, TextArea } from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession/types";
import {
  PamPolicyType,
  TPamAccount,
  useAccessPamAccount,
  useGetAwsIamConsoleUrl
} from "@app/hooks/api/pam";

import { WebAccessStatusCard } from "./WebAccessStatusCard";

const resolvePolicy = (account: TPamAccount) => {
  const policies = (account.templatePolicies ?? {}) as Record<string, unknown>;
  return {
    requireReason: policies[PamPolicyType.RequireReason] === true,
    requireMfa: policies[PamPolicyType.RequireMfa] === true
  };
};

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

type Props = {
  account: TPamAccount;
};

export const AwsIamAccessContent = ({ account }: Props) => {
  const accessPamAccount = useAccessPamAccount();
  const getAwsIamConsoleUrl = useGetAwsIamConsoleUrl();

  const [step, setStep] = useState<"reason" | "mfa" | "loading" | "error">("reason");
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasRequestedRef = useRef(false);
  const popupRef = useRef<Window | null>(null);

  const policy = resolvePolicy(account);

  const callAccess = useCallback(
    async (mfaSessionId?: string) => {
      if (!account.folderName) {
        setErrorMessage("Account folder name is missing");
        setStep("error");
        return;
      }

      setStep("loading");

      try {
        const response = await accessPamAccount.mutateAsync({
          path: `${account.folderName}/${account.name}`,
          reason: reason.trim() || undefined,
          accessMethod: "web",
          mfaSessionId
        });

        const md = response.metadata;
        if (!md?.accessKeyId || !md?.secretAccessKey || !md?.sessionToken) {
          setErrorMessage("Backend did not return AWS credentials");
          setStep("error");
          return;
        }

        popupRef.current?.close();

        const { consoleUrl } = await getAwsIamConsoleUrl.mutateAsync({
          sessionId: response.sessionId,
          accessKeyId: md.accessKeyId,
          secretAccessKey: md.secretAccessKey,
          sessionToken: md.sessionToken
        });

        window.location.href = consoleUrl;
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: {
            data?: {
              error?: string;
              message?: string;
              details?: { mfaSessionId?: string };
            };
          };
        };

        if (axiosErr?.response?.data?.error === "SESSION_MFA_REQUIRED") {
          const mfaSid = axiosErr.response!.data!.details?.mfaSessionId;
          if (mfaSid) {
            setStep("mfa");
            const mfaUrl = `${window.location.origin}/mfa-session/${mfaSid}`;
            popupRef.current = window.open(mfaUrl, "_blank");

            const startTime = Date.now();
            const pollInterval = window.setInterval(async () => {
              try {
                if (Date.now() - startTime > MFA_TIMEOUT) {
                  window.clearInterval(pollInterval);
                  setErrorMessage("MFA verification timed out");
                  setStep("error");
                  return;
                }
                const resp = await apiRequest.get<TMfaSessionStatusResponse>(
                  `/api/v2/mfa-sessions/${mfaSid}/status`
                );
                if (resp.data.status === MfaSessionStatus.ACTIVE) {
                  window.clearInterval(pollInterval);
                  await callAccess(mfaSid);
                }
              } catch {
                window.clearInterval(pollInterval);
                setErrorMessage("MFA verification failed");
                setStep("error");
              }
            }, MFA_POLL_INTERVAL);
            return;
          }
        }

        setErrorMessage(axiosErr?.response?.data?.message ?? "Failed to access AWS Console");
        setStep("error");
      }
    },
    [account.folderName, account.name, reason, accessPamAccount, getAwsIamConsoleUrl]
  );

  const handleReasonSubmit = useCallback(() => {
    if (policy.requireReason && !reason.trim()) return;
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    callAccess();
  }, [policy.requireReason, reason, callAccess]);

  if (step === "error") {
    return (
      <WebAccessStatusCard
        tone="danger"
        icon={TriangleAlert}
        title="Access Failed"
        description={errorMessage ?? "An unknown error occurred"}
      >
        <Button
          variant="pam"
          isFullWidth
          onClick={() => {
            hasRequestedRef.current = false;
            setErrorMessage(null);
            setStep("reason");
          }}
        >
          Try Again
        </Button>
      </WebAccessStatusCard>
    );
  }

  if (step === "reason" && (policy.requireReason || !hasRequestedRef.current)) {
    return (
      <WebAccessStatusCard icon={ShieldAlert} title="Before You Continue">
        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-1 text-label">
              {policy.requireReason ? "Reason (required)" : "Reason (optional)"}
            </Label>
            <TextArea
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              placeholder="Why do you need access?"
              rows={3}
              maxLength={1000}
            />
          </div>
          <Button
            variant="pam"
            isFullWidth
            onClick={handleReasonSubmit}
            disabled={policy.requireReason && !reason.trim()}
          >
            {!policy.requireReason && !reason.trim() ? "Skip & Continue" : "Continue"}
          </Button>
        </div>
      </WebAccessStatusCard>
    );
  }

  if (step === "mfa") {
    return (
      <WebAccessStatusCard
        icon={ShieldAlert}
        title="MFA Verification"
        description="Complete multi-factor authentication in the popup window."
      >
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-6 animate-spin text-product-pam" />
        </div>
      </WebAccessStatusCard>
    );
  }

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-8 animate-spin text-product-pam" />
        <p className="text-sm font-medium text-foreground">Connecting to AWS...</p>
      </div>
    </div>
  );
};

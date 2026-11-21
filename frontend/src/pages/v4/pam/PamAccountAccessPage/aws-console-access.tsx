import { useRef, useState } from "react";

import type { TPamAccount } from "@app/hooks/api/pam";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { AccessFailed, AccessPending, ReasonCard } from "./access-gate";
import { MFA_FAILED, mfaSessionIdOf, requiresReason } from "./web-access";

export const AwsConsoleAccess = ({ account }: { account: TPamAccount }) => {
  const accessAccount = useV4Adapter("pam").useAccessAccount();
  const runMfa = useV4Adapter("pamAccess").useMfaChallenge();
  const [step, setStep] = useState<"reason" | "mfa" | "loading" | "error">("reason");
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState("");
  const requestedRef = useRef(false);

  const fail = (message: string) => {
    setFailure(message);
    setStep("error");
  };

  const openConsole = async (mfaSessionId?: string): Promise<void> => {
    if (!account.folderName) {
      fail("Account folder name is missing");
      return;
    }
    setStep("loading");
    try {
      const response = await accessAccount.mutateAsync({
        path: `${account.folderName}/${account.name}`,
        reason: reason.trim() || undefined,
        accessMethod: "web",
        mfaSessionId
      });
      const consoleUrl = response.metadata?.consoleUrl;
      if (!consoleUrl) {
        fail("Backend did not return a console URL");
        return;
      }
      window.location.href = consoleUrl;
    } catch (error) {
      const challenge = mfaSessionIdOf(error);
      if (!challenge) {
        fail(errorMessage(error) ?? "Failed to access AWS Console");
        return;
      }
      setStep("mfa");
      const outcome = await runMfa(challenge);
      if (outcome === "verified") await openConsole(challenge);
      else fail(MFA_FAILED[outcome]);
    }
  };

  if (step === "error")
    return (
      <AccessFailed
        message={failure}
        onRetry={() => {
          requestedRef.current = false;
          setStep("reason");
        }}
      />
    );
  if (step === "mfa")
    return (
      <AccessPending
        title="MFA verification"
        label="Complete multi-factor authentication in the pop-up window"
      />
    );
  if (step === "loading") return <AccessPending title="AWS Console" label="Connecting to AWS" />;
  return (
    <ReasonCard
      required={requiresReason(account)}
      reason={reason}
      onReasonChange={setReason}
      onContinue={() => {
        if (requestedRef.current) return;
        requestedRef.current = true;
        openConsole();
      }}
    />
  );
};

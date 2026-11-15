import { type ReactNode, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Field } from "@infisical/cipher/ui/field";
import { Spinner } from "@infisical/cipher/ui/spinner";
import { Textarea } from "@infisical/cipher/ui/textarea";

import type { TPamAccount } from "@app/hooks/api/pam";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { MFA_FAILED, mfaSessionIdOf, requiresMfa, requiresReason } from "./web-access";

export const AccessCard = ({
  title,
  footer,
  children
}: {
  title: string;
  footer?: ReactNode;
  children?: ReactNode;
}) => (
  <div
    style={{
      display: "flex",
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: "var(--cipher-space-24) 0"
    }}
  >
    <Card title={title} footer={footer} style={{ width: "100%", maxWidth: 480 }}>
      {children}
    </Card>
  </div>
);

export const AccessFailed = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <AccessCard
    title="Access failed"
    footer={
      <Button variant="outline" icon="sync" onClick={onRetry}>
        Try again
      </Button>
    }
  >
    {message}
  </AccessCard>
);

export const AccessPending = ({ title, label }: { title: string; label: string }) => (
  <AccessCard title={title}>
    <Spinner size="base" label={label} />
  </AccessCard>
);

export const ReasonCard = ({
  required,
  reason,
  onReasonChange,
  onContinue
}: {
  required: boolean;
  reason: string;
  onReasonChange: (reason: string) => void;
  onContinue: () => void;
}) => {
  const canContinue = !required || reason.trim().length > 0;
  return (
    <AccessCard
      title="Before you continue"
      footer={
        <Button
          disabledReason={canContinue ? undefined : "Enter a reason first"}
          onClick={onContinue}
        >
          {!required && !reason.trim() ? "Skip and continue" : "Continue"}
        </Button>
      }
    >
      <Field label="Reason" optional={!required} description="Stored with this session for audit.">
        <Textarea
          rows={3}
          maxLength={1000}
          placeholder="Running migration for release 2.4"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canContinue)
              onContinue();
          }}
        />
      </Field>
    </AccessCard>
  );
};

type TGateResult = { reason?: string; mfaSessionId?: string };

export const SessionAccessGate = ({
  account,
  children
}: {
  account: TPamAccount;
  children: (result: TGateResult) => ReactNode;
}) => {
  const webAccess = useV4Adapter("pam").useWebAccess();
  const runMfa = useV4Adapter("pamAccess").useMfaChallenge();
  const [step, setStep] = useState<"reason" | "checking" | "mfa" | "verifying" | "done" | "error">(
    "reason"
  );
  const [reason, setReason] = useState("");
  const [mfaSessionId, setMfaSessionId] = useState<string>();
  const [failure, setFailure] = useState("");
  const trimmed = reason.trim() || undefined;

  const fail = (message: string) => {
    setFailure(message);
    setStep("error");
  };

  const submitReason = async () => {
    if (!requiresMfa(account)) {
      setStep("done");
      return;
    }
    setStep("checking");
    try {
      await webAccess.requestTicket({ accountId: account.id, reason: trimmed });
      setStep("done");
    } catch (error) {
      const challenge = mfaSessionIdOf(error);
      if (!challenge) {
        fail(errorMessage(error) ?? "Failed to access account. Please try again.");
        return;
      }
      setMfaSessionId(challenge);
      setStep("mfa");
    }
  };

  const verifyMfa = async () => {
    if (!mfaSessionId) return;
    setStep("verifying");
    const outcome = await runMfa(mfaSessionId);
    if (outcome === "verified") setStep("done");
    else fail(MFA_FAILED[outcome]);
  };

  if (step === "done") return children({ reason: trimmed, mfaSessionId });
  if (step === "checking")
    return <AccessPending title="Before you continue" label="Checking access" />;
  if (step === "verifying")
    return (
      <AccessPending
        title="MFA verification"
        label="Waiting for verification in the pop-up window"
      />
    );
  if (step === "error")
    return (
      <AccessFailed
        message={failure}
        onRetry={() => {
          setMfaSessionId(undefined);
          setStep("reason");
        }}
      />
    );
  if (step === "mfa")
    return (
      <AccessCard
        title="MFA verification required"
        footer={<Button onClick={verifyMfa}>Verify MFA</Button>}
      />
    );
  return (
    <ReasonCard
      required={requiresReason(account)}
      reason={reason}
      onReasonChange={setReason}
      onContinue={submitReason}
    />
  );
};

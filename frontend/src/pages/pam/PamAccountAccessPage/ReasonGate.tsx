import { ReactNode, useState } from "react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  TextArea
} from "@app/components/v3";
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
};

type Props = {
  account: TPamAccount;
  children: (result: TSessionAccessGateResult) => ReactNode;
};

export const SessionAccessGate = ({ account, children }: Props) => {
  const policy = resolveAccessPolicy(account);

  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState("");

  if (submitted) {
    const trimmed = reason.trim();
    return <>{children({ reason: trimmed || undefined })}</>;
  }

  const trimmed = reason.trim();
  const canSubmit = !policy.requireReason || trimmed.length > 0;

  const handleSubmit = () => {
    if (canSubmit) setSubmitted(true);
  };

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
                handleSubmit();
              }
            }}
          />
          <Button variant="pam" isFullWidth onClick={handleSubmit} isDisabled={!canSubmit}>
            {!policy.requireReason && trimmed.length === 0 ? "Skip & Continue" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

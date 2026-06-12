import { ReactNode, useState } from "react";

import { Button } from "@app/components/v3/generic/Button";
import { TPamAccount } from "@app/hooks/api/pam";

type TAccessPolicy = {
  requireReason: boolean;
  maxSessionDurationSeconds: number;
  requireMfa: boolean;
};

const DEFAULT_ACCESS_POLICY: TAccessPolicy = {
  requireReason: false,
  maxSessionDurationSeconds: 3600,
  requireMfa: false
};

export const resolveAccessPolicy = (account: TPamAccount): TAccessPolicy => {
  const templatePolicy = account.templateAccessPolicy as Partial<TAccessPolicy> | null;
  return { ...DEFAULT_ACCESS_POLICY, ...templatePolicy };
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
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bunker-800">
      <h2 className="text-sm font-medium text-mineshaft-100">Before You Continue</h2>
      <p className="max-w-sm text-center text-xs text-mineshaft-400">
        {policy.requireReason
          ? "A reason is required for this session. The reason will be stored for audit purposes."
          : "Optionally provide a reason for this session. The reason will be stored for audit purposes."}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <textarea
          className="w-full rounded border border-mineshaft-600 bg-bunker-700 px-3 py-2 text-xs text-mineshaft-200 placeholder:text-mineshaft-500 focus:border-mineshaft-400 focus:outline-none"
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
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="xs" onClick={handleSubmit} isDisabled={!canSubmit}>
            {trimmed.length === 0 ? "Skip & Continue" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};

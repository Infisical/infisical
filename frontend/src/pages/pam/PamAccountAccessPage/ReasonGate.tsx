import { ReactNode, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";
import { TPamAccount } from "@app/hooks/api/pam";

type Props = {
  account: TPamAccount;
  children: (reason: string) => ReactNode;
};

export const ReasonGate = ({ account, children }: Props) => {
  const [submittedReason, setSubmittedReason] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);

  if (submittedReason !== null) {
    return <>{children(submittedReason)}</>;
  }

  const isReasonRequired = Boolean(account.requireReason);

  const trimmed = draft.trim();
  const canContinue = !isReasonRequired || trimmed.length > 0;
  const showError = touched && isReasonRequired && trimmed.length === 0;

  const handleSubmit = () => {
    if (!canContinue) {
      setTouched(true);
      return;
    }
    setSubmittedReason(trimmed);
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bunker-800">
      {isReasonRequired ? <AlertTriangleIcon className="size-8 text-mineshaft-400" /> : null}
      <h2 className="text-sm font-medium text-mineshaft-100">
        {isReasonRequired ? "Reason Required" : "Before You Continue"}
      </h2>
      <p className="max-w-sm text-center text-xs text-mineshaft-400">
        {isReasonRequired
          ? "This account's policy requires a reason for access. The reason will be stored for audit purposes."
          : "Optionally provide a reason for this session. The reason will be stored for audit purposes."}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <textarea
          className="w-full rounded border border-mineshaft-600 bg-bunker-700 px-3 py-2 text-xs text-mineshaft-200 placeholder:text-mineshaft-500 focus:border-mineshaft-400 focus:outline-none"
          placeholder={
            isReasonRequired
              ? "e.g. Investigating incident INC-1234"
              : "Optional, e.g. Running migration for release 2.4"
          }
          rows={3}
          maxLength={1000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              handleSubmit();
            }
          }}
        />
        {showError && <p className="text-xs text-red-400">A reason is required to continue.</p>}
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="xs" onClick={handleSubmit}>
            {!isReasonRequired && trimmed.length === 0 ? "Skip & Continue" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};

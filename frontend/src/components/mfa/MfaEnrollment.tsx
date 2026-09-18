import { useEffect, useRef } from "react";

import SecurityClient from "@app/components/utilities/SecurityClient";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";

import { MFA_METHOD_LABELS, VerifyStep } from "./setup";

type Props = {
  method: MfaMethod;
  onComplete: () => void | Promise<void>;
};

// Guided factor setup shown at login when an org enforces MFA but the user has not
// yet configured the required method (e.g. right after signup). It only enrolls the
// factor (proves and persists it). It deliberately does NOT enable MFA or mint
// recovery codes: those happen when the user completes the org MFA challenge next
// (verifyMfaToken), so a pre-MFA session can never bootstrap recovery codes.
export const MfaEnrollment = ({ method, onComplete }: Props) => {
  const hasPrepared = useRef(false);

  useEffect(() => {
    if (hasPrepared.current) return;
    hasPrepared.current = true;

    SecurityClient.setMfaToken("");
  }, []);

  const handleVerified = async () => {
    SecurityClient.setMfaToken(getMfaTempToken());
    await onComplete();
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pt-4 pb-4">
      <div className="text-center">
        <h2 className="text-xl font-medium text-foreground">Set up two-factor authentication</h2>
        <p className="mt-2 text-sm text-muted">
          Your organization requires {MFA_METHOD_LABELS[method]} to be configured.
        </p>
      </div>

      <VerifyStep method={method} onVerified={handleVerified} />
    </div>
  );
};

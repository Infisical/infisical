import { useEffect, useRef, useState } from "react";

import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button } from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS, VerifyStep } from "./setup";

type Props = {
  methods: MfaMethod[];
  onComplete: () => void | Promise<void>;
  onUseRecoveryCode?: () => void;
};

// Guided factor setup shown at login when an org enforces MFA but the user has not
// yet configured any of the methods it allows (e.g. right after signup). It only enrolls the
// factor (proves and persists it). It deliberately does NOT enable MFA or mint
// recovery codes: those happen when the user completes the org MFA challenge next
// (verifyMfaToken), so a pre-MFA session can never bootstrap recovery codes.
export const MfaEnrollment = ({ methods, onComplete, onUseRecoveryCode }: Props) => {
  const hasPrepared = useRef(false);
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod | null>(
    methods.length === 1 ? methods[0] : null
  );

  useEffect(() => {
    if (hasPrepared.current) return;
    hasPrepared.current = true;

    SecurityClient.setMfaToken("");
  }, []);

  const handleVerified = async () => {
    SecurityClient.setMfaToken(getMfaTempToken());
    await onComplete();
  };

  const linkClassName =
    "cursor-pointer text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pt-4 pb-4">
      <div className="text-center">
        <h2 className="text-xl font-normal text-foreground">Set up two-factor authentication</h2>
        {methods.length > 1 && !selectedMethod && (
          <p className="mt-2 text-sm text-muted">
            Set up one of the methods your organization allows to sign in.
          </p>
        )}
      </div>

      {selectedMethod ? (
        <>
          <VerifyStep method={selectedMethod} onVerified={handleVerified} />
          {methods.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedMethod(null)}
              className={`self-center text-sm ${linkClassName}`}
            >
              Choose a different method
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {methods.map((method) => {
            const Icon = MFA_METHOD_ICONS[method];
            return (
              <Button
                key={method}
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => setSelectedMethod(method)}
              >
                <Icon />
                {MFA_METHOD_LABELS[method]}
              </Button>
            );
          })}
        </div>
      )}

      {onUseRecoveryCode && (
        <p className="text-center text-sm text-muted">
          Can&apos;t finish setup?{" "}
          <button type="button" onClick={onUseRecoveryCode} className={linkClassName}>
            Use a recovery code
          </button>
        </p>
      )}
    </div>
  );
};

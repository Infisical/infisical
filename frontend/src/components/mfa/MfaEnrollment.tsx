import { useEffect, useRef, useState } from "react";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { ContentLoader } from "@app/components/v2";
import { Button } from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import { useUpdateUserMfa } from "@app/hooks/api/users";

import { MFA_METHOD_LABELS, RecoveryCodesStep, VerifyStep } from "./setup";

type Props = {
  method: MfaMethod;
  onComplete: () => void | Promise<void>;
};

// Guided enrollment used when an org enforces MFA but the user has not yet set
// up the required method (e.g. right after signup). Mirrors the settings wizard:
// enable MFA (which mints recovery codes) -> verify the method -> save codes.
export const MfaEnrollment = ({ method, onComplete }: Props) => {
  const { mutateAsync: updateUserMfa } = useUpdateUserMfa();
  const [phase, setPhase] = useState<"preparing" | "verify" | "recovery">("preparing");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [hasSaved, setHasSaved] = useState(false);
  const hasPrepared = useRef(false);

  const hasRecoveryCodes = recoveryCodes.length > 0;

  useEffect(() => {
    if (hasPrepared.current) return;
    hasPrepared.current = true;

    // The verification/enable endpoints authenticate with the base access token, so clear the
    // temporary MFA token before mounting the verify step (TOTP fires a registration request on
    // mount). MFA itself is enabled only once the method is verified — see handleVerified.
    SecurityClient.setMfaToken("");
    setPhase("verify");
  }, []);

  const handleVerified = async () => {
    try {
      const { recoveryCodes: codes } = await updateUserMfa({
        isMfaEnabled: true,
        selectedMfaMethod: method
      });
      setRecoveryCodes(codes ?? []);
      setPhase("recovery");
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to enable two-factor authentication",
        type: "error"
      });
    }
  };

  const handleContinue = async () => {
    // Restore the temp token so downstream MFA verification can proceed.
    SecurityClient.setMfaToken(getMfaTempToken());
    await onComplete();
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pt-4 pb-4">
      <div className="text-center">
        <h2 className="text-xl font-medium text-bunker-100">Set up two-factor authentication</h2>
        <p className="mt-2 text-sm text-bunker-300">
          Your organization requires {MFA_METHOD_LABELS[method]} to be configured.
        </p>
      </div>

      {phase === "preparing" && <ContentLoader />}

      {phase === "verify" && <VerifyStep method={method} onVerified={handleVerified} />}

      {phase === "recovery" && (
        <div className="flex flex-col gap-4">
          <RecoveryCodesStep recoveryCodes={recoveryCodes} onSaved={() => setHasSaved(true)} />
          <Button
            variant="org"
            isFullWidth
            isDisabled={hasRecoveryCodes && !hasSaved}
            onClick={handleContinue}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
};

import { useEffect, useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { ContentLoader } from "@app/components/v2";
import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import { fetchMfaRecoveryCodes, useUpdateUserMfa } from "@app/hooks/api/users";

import { MFA_METHOD_LABELS, RecoveryCodesView, VerifyStep } from "./setup";

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
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const hasPrepared = useRef(false);

  const hasRecoveryCodes = recoveryCodes.length > 0;

  useEffect(() => {
    if (hasPrepared.current) return;
    hasPrepared.current = true;

    const prepare = async () => {
      // The enrollment endpoints authenticate with the regular access token, so
      // clear the temporary MFA token first.
      SecurityClient.setMfaToken("");
      try {
        // Enabling is the single place recovery codes are minted; idempotent if
        // MFA is already on.
        await updateUserMfa({ isMfaEnabled: true });
        setPhase("verify");
      } catch (error: any) {
        createNotification({
          text: error?.response?.data?.message || "Failed to start two-factor setup",
          type: "error"
        });
      }
    };

    prepare();
  }, [updateUserMfa]);

  const loadRecoveryCodes = async () => {
    setIsLoadingCodes(true);
    try {
      setRecoveryCodes(await fetchMfaRecoveryCodes());
    } catch {
      setRecoveryCodes([]);
    } finally {
      setIsLoadingCodes(false);
    }
  };

  const handleVerified = async () => {
    try {
      await updateUserMfa({ selectedMfaMethod: method });
    } catch {
      // preference update is best-effort
    }
    setPhase("recovery");
    await loadRecoveryCodes();
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

      {phase === "recovery" &&
        (isLoadingCodes ? (
          <ContentLoader />
        ) : (
          <div className="flex flex-col gap-4">
            {hasRecoveryCodes ? (
              <>
                <Alert variant="warning">
                  <TriangleAlertIcon />
                  <AlertTitle>Save your recovery codes</AlertTitle>
                  <AlertDescription>
                    Store these somewhere safe. Each works once if you lose access to your other
                    methods.
                  </AlertDescription>
                </Alert>
                <RecoveryCodesView
                  recoveryCodes={recoveryCodes}
                  onSaved={() => setHasSaved(true)}
                />
              </>
            ) : (
              <Alert variant="danger">
                <TriangleAlertIcon />
                <AlertTitle>Couldn&apos;t load recovery codes</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  Two-factor authentication is enabled, but we couldn&apos;t retrieve your recovery
                  codes. Generate them before continuing so you don&apos;t get locked out.
                  <Button variant="outline" size="sm" onClick={loadRecoveryCodes}>
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <Button
              variant="org"
              isFullWidth
              isDisabled={!hasRecoveryCodes || !hasSaved}
              onClick={handleContinue}
            >
              Continue
            </Button>
          </div>
        ))}
    </div>
  );
};

import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

import { RecoveryCodesView } from "./RecoveryCodesView";

type Props = {
  recoveryCodes: string[];
  onSaved: () => void;
};

// Shared final step for the MFA enrollment and settings wizard: shows the newly
// minted recovery codes with a save prompt, or a danger fallback when enabling
// MFA returned no codes (e.g. MFA was already on) so the user knows to
// regenerate them from their security settings.
export const RecoveryCodesStep = ({ recoveryCodes, onSaved }: Props) => {
  if (recoveryCodes.length === 0) {
    return (
      <Alert variant="danger">
        <TriangleAlertIcon />
        <AlertTitle>Couldn&apos;t load recovery codes</AlertTitle>
        <AlertDescription>
          Two-factor authentication is enabled, but we couldn&apos;t display your recovery codes.
          Regenerate them from your security settings so you don&apos;t get locked out.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Alert variant="warning">
        <TriangleAlertIcon />
        <AlertTitle>Save your recovery codes</AlertTitle>
        <AlertDescription>
          Store these somewhere safe. Each code works once and lets you sign in if you lose access
          to your other methods.
        </AlertDescription>
      </Alert>
      <RecoveryCodesView recoveryCodes={recoveryCodes} onSaved={onSaved} />
    </>
  );
};

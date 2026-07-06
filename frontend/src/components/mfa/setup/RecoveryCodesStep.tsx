import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

import { RecoveryCodesView } from "./RecoveryCodesView";

type Props = {
  recoveryCodes: string[];
  onSaved: () => void;
};

// Shared final step for the MFA enrollment and settings wizard: shows the newly
// minted recovery codes with a save prompt. When enabling MFA returned no codes
// (it was already on, so codes were generated during the original setup), show an
// informational note pointing to personal settings instead of an error.
export const RecoveryCodesStep = ({ recoveryCodes, onSaved }: Props) => {
  if (recoveryCodes.length === 0) {
    return (
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>Two-factor authentication is already enabled</AlertTitle>
        <AlertDescription>
          Your recovery codes were generated when you first set up two-factor authentication. You
          can view or regenerate them anytime from the Authentication section of your personal
          settings.
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

import { ComponentProps } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";

import { RecoveryCodesView } from "./RecoveryCodesView";

type Props = {
  recoveryCodes: string[];
  onSaved?: () => void;
  acknowledgment?: ComponentProps<typeof RecoveryCodesView>["acknowledgment"];
};

// Shared final step of MFA setup: shows the newly minted recovery codes with a
// save prompt.
export const RecoveryCodesStep = ({ recoveryCodes, onSaved, acknowledgment }: Props) => {
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
      <RecoveryCodesView
        recoveryCodes={recoveryCodes}
        onSaved={onSaved}
        acknowledgment={acknowledgment}
      />
    </>
  );
};

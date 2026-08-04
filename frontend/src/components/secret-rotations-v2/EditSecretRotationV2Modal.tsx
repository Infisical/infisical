import { useState } from "react";

import { SecretRotationV2Form } from "@app/components/secret-rotations-v2/forms";
import {
  SecretRotationSheet,
  SecretRotationSheetContent
} from "@app/components/secret-rotations-v2/SecretRotationSheet";
import { SecretRotationV2ModalHeader } from "@app/components/secret-rotations-v2/SecretRotationV2ModalHeader";
import { DiscardChangesAlert, useUnsavedChangesGuard } from "@app/components/v3";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretRotation?: TSecretRotationV2;
};

export const EditSecretRotationV2Modal = ({ secretRotation, onOpenChange, isOpen }: Props) => {
  const [isDirty, setIsDirty] = useState(false);

  const applyOpenChange = (open: boolean) => {
    if (!open) {
      setIsDirty(false);
    }
    onOpenChange(open);
  };

  const {
    onOpenChange: guardedOpenChange,
    confirmIfDirty,
    discardAlertProps
  } = useUnsavedChangesGuard({
    isDirty,
    onOpenChange: applyOpenChange
  });

  return (
    <>
      <SecretRotationSheet open={isOpen} onOpenChange={guardedOpenChange}>
        <SecretRotationSheetContent>
          {secretRotation && (
            <>
              <div className="shrink-0 border-b border-border p-6">
                <SecretRotationV2ModalHeader isConfigured type={secretRotation.type} />
              </div>
              <SecretRotationV2Form
                isSheet
                onComplete={() => onOpenChange(false)}
                onCancel={() => {
                  confirmIfDirty(() => onOpenChange(false));
                }}
                onDirtyChange={setIsDirty}
                secretRotation={secretRotation}
                type={secretRotation.type}
                secretPath={secretRotation.folder.path}
                environment={secretRotation.environment.slug}
              />
            </>
          )}
        </SecretRotationSheetContent>
      </SecretRotationSheet>
      <DiscardChangesAlert
        {...discardAlertProps}
        title="Discard changes?"
        description="Your unsaved changes to this secret rotation will be lost."
      />
    </>
  );
};

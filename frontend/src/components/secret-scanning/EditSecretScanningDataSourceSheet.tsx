import { useCallback, useState } from "react";

import { DiscardChangesAlertDialog, Sheet, SheetContent } from "@app/components/v3";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { SecretScanningDataSourceForm } from "./forms";
import {
  SecretScanningDataSourcePopupContext,
  useSecretScanningDataSourcePopupRegistry
} from "./SecretScanningDataSourcePopupContext";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  dataSource?: TSecretScanningDataSource;
};

export const EditSecretScanningDataSourceSheet = ({ isOpen, onOpenChange, dataSource }: Props) => {
  const popupRegistry = useSecretScanningDataSourcePopupRegistry();
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeSheet = useCallback(() => {
    setIsDirty(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  return (
    <>
      <Sheet
        open={isOpen && Boolean(dataSource)}
        onOpenChange={(open) => {
          if (open) {
            onOpenChange(true);
            return;
          }
          requestDiscard();
        }}
      >
        <SheetContent
          size="wide"
          isPending={isSubmitting}
          onEscapeKeyDown={popupRegistry.onEscapeKeyDown}
        >
          {dataSource && (
            <SecretScanningDataSourcePopupContext.Provider value={popupRegistry.onPopupOpenChange}>
              <SecretScanningDataSourceForm
                key={dataSource.id}
                dataSource={dataSource}
                onComplete={closeSheet}
                onCancel={requestDiscard}
                onDirtyChange={setIsDirty}
                onSubmittingChange={setIsSubmitting}
              />
            </SecretScanningDataSourcePopupContext.Provider>
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your changes to this data source will be lost."
      />
    </>
  );
};

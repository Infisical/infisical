import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { TSecretScanningDataSourceForm } from "@app/components/secret-scanning/forms/schemas";
import { DiscardChangesAlertDialog, Sheet, SheetContent } from "@app/components/v3";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { SecretScanningDataSourceForm } from "./forms";
import {
  SecretScanningDataSourcePopupContext,
  useSecretScanningDataSourcePopupRegistry
} from "./SecretScanningDataSourcePopupContext";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const CreateSecretScanningDataSourceSheet = ({ isOpen, onOpenChange }: Props) => {
  const popupRegistry = useSecretScanningDataSourcePopupRegistry();
  const [initialFormData, setInitialFormData] = useState<Partial<TSecretScanningDataSourceForm>>();
  const [isDirty, setIsDirty] = useState(false);

  const {
    location: {
      search: { connectionId, connectionName, ...search },
      pathname
    }
  } = useRouterState();

  const navigate = useNavigate();

  useEffect(() => {
    if (connectionId && connectionName) {
      const storedFormData = localStorage.getItem("secretScanningDataSourceFormData");

      if (!storedFormData) return;

      let form: Partial<TSecretScanningDataSourceForm> = {};
      try {
        form = JSON.parse(storedFormData) as TSecretScanningDataSourceForm;
      } catch {
        return;
      } finally {
        localStorage.removeItem("secretScanningDataSourceFormData");
      }

      setInitialFormData({
        ...form,
        connection: { id: connectionId, name: connectionName }
      });
      onOpenChange(true);

      navigate({
        to: pathname,
        search
      });
    }
  }, [connectionId, connectionName]);

  const closeSheet = useCallback(() => {
    setInitialFormData(undefined);
    setIsDirty(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            onOpenChange(true);
            return;
          }
          requestDiscard();
        }}
      >
        <SheetContent size="wide" onEscapeKeyDown={popupRegistry.onEscapeKeyDown}>
          <SecretScanningDataSourcePopupContext.Provider value={popupRegistry.onPopupOpenChange}>
            <SecretScanningDataSourceForm
              initialType={initialFormData?.type}
              initialFormData={initialFormData}
              onComplete={closeSheet}
              onCancel={requestDiscard}
              onDirtyChange={setIsDirty}
            />
          </SecretScanningDataSourcePopupContext.Provider>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Data Source Setup?"
        description="Your progress configuring this data source will be lost."
      />
    </>
  );
};

import { useEffect, useState } from "react";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import {
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { CreateSecretSyncForm } from "./forms";
import { SecretSyncModalHeader } from "./SecretSyncModalHeader";
import { SecretSyncSelect } from "./SecretSyncSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectSync?: SecretSync | null;
  initialFormData?: Partial<TSecretSyncForm>;
};

type ContentProps = {
  onComplete: (secretSync: TSecretSync) => void;
  selectedSync: SecretSync | null;
  setSelectedSync: (selectedSync: SecretSync | null) => void;
  initialFormData?: Partial<TSecretSyncForm>;
  onDirtyChange: (isDirty: boolean) => void;
};

const Content = ({
  onComplete,
  setSelectedSync,
  selectedSync,
  initialFormData,
  onDirtyChange
}: ContentProps) => {
  if (selectedSync) {
    return (
      <CreateSecretSyncForm
        initialFormData={initialFormData}
        onComplete={onComplete}
        onCancel={() => setSelectedSync(null)}
        onDirtyChange={onDirtyChange}
        destination={selectedSync}
      />
    );
  }

  return <SecretSyncSelect onSelect={setSelectedSync} />;
};

export const CreateSecretSyncModal = ({
  isOpen,
  onOpenChange,
  selectSync = null,
  initialFormData
}: Props) => {
  const [selectedSync, setSelectedSync] = useState<SecretSync | null>(selectSync);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setSelectedSync(selectSync);
  }, [selectSync]);

  const closeSheet = () => {
    setSelectedSync(null);
    setIsDirty(false);
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      requestDiscard();
      return;
    }
    onOpenChange(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
          <SheetHeader className="border-b">
            {selectedSync ? (
              <>
                <SheetTitle className="sr-only">Configure secret sync</SheetTitle>
                <SecretSyncModalHeader
                  isConfigured={false}
                  destination={selectedSync}
                  showDocLink={false}
                />
              </>
            ) : (
              <>
                <SheetTitle>Choose a destination</SheetTitle>
                <SheetDescription>
                  Where should Infisical write these secrets? You can change this later only by
                  creating a new sync.
                </SheetDescription>
              </>
            )}
          </SheetHeader>
          {selectedSync ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <Content
                onComplete={closeSheet}
                selectedSync={selectedSync}
                setSelectedSync={setSelectedSync}
                initialFormData={initialFormData}
                onDirtyChange={setIsDirty}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <Content
                onComplete={closeSheet}
                selectedSync={selectedSync}
                setSelectedSync={setSelectedSync}
                initialFormData={initialFormData}
                onDirtyChange={setIsDirty}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Sync Setup?"
        description="Your progress configuring this sync will be lost."
      />
    </>
  );
};

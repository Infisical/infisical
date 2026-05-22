import { useEffect, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

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
};

const Content = ({ onComplete, setSelectedSync, selectedSync, initialFormData }: ContentProps) => {
  if (selectedSync) {
    return (
      <CreateSecretSyncForm
        initialFormData={initialFormData}
        onComplete={onComplete}
        onCancel={() => setSelectedSync(null)}
        destination={selectedSync}
      />
    );
  }

  return <SecretSyncSelect onSelect={setSelectedSync} />;
};

// DEV: auto-open the sync modal with AWS Parameter Store pre-selected so the
// form is mounted on every reload. Remove before shipping.
// const DEV_AUTO_OPEN = import.meta.env.DEV;

export const CreateSecretSyncModal = ({
  isOpen,
  onOpenChange,
  selectSync = null,
  initialFormData
}: Props) => {
  const [selectedSync, setSelectedSync] = useState<SecretSync | null>(selectSync);
  // const [selectedSync, setSelectedSync] = useState<SecretSync | null>(
  //   selectSync ?? (DEV_AUTO_OPEN ? SecretSync.AWSParameterStore : null)
  // );
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  useEffect(() => {
    setSelectedSync(selectSync);
    // setSelectedSync(selectSync ?? (DEV_AUTO_OPEN ? SecretSync.AWSParameterStore : null));
  }, [selectSync]);

  // useEffect(() => {
  //   if (DEV_AUTO_OPEN && !isOpen) onOpenChange(true);
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  const closeSheet = () => {
    setSelectedSync(null);
    onOpenChange(false);
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && selectedSync) {
      // User has started filling out the form — confirm before discarding.
      setConfirmDiscardOpen(true);
      return;
    }
    if (!nextOpen) setSelectedSync(null);
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
          <SheetHeader className="border-b">
            <SheetTitle>
              {selectedSync ? (
                <SecretSyncModalHeader isConfigured={false} destination={selectedSync} />
              ) : (
                "Choose a destination"
              )}
            </SheetTitle>
            {!selectedSync && (
              <SheetDescription>
                Where should Infisical write these secrets? You can change this later only by
                creating a new sync.
              </SheetDescription>
            )}
          </SheetHeader>
          {selectedSync ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <Content
                onComplete={closeSheet}
                selectedSync={selectedSync}
                setSelectedSync={setSelectedSync}
                initialFormData={initialFormData}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <Content
                onComplete={closeSheet}
                selectedSync={selectedSync}
                setSelectedSync={setSelectedSync}
                initialFormData={initialFormData}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard Sync Setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress configuring this sync will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={closeSheet}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

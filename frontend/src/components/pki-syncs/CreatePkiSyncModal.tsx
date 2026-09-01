import { useEffect, useState } from "react";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";

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
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./forms/schemas/pki-sync-schema";
import { CreatePkiSyncForm } from "./forms";
import { PkiSyncModalHeader } from "./PkiSyncModalHeader";
import { PkiSyncSelect } from "./PkiSyncSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectSync?: PkiSync | null;
  initialData?: Partial<TPkiSyncForm>;
  applicationId?: string;
};

export const CreatePkiSyncModal = ({
  isOpen,
  onOpenChange,
  selectSync = null,
  initialData,
  applicationId
}: Props) => {
  const [selectedSync, setSelectedSync] = useState<PkiSync | null>(selectSync);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  useEffect(() => {
    setSelectedSync(selectSync);
  }, [selectSync]);

  const closeSheet = () => {
    setConfirmDiscardOpen(false);
    setSelectedSync(null);
    onOpenChange(false);
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && selectedSync) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!nextOpen) setSelectedSync(null);
    onOpenChange(nextOpen);
  };

  const showBack = !selectSync && Boolean(selectedSync);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 p-0 sm:max-w-[1500px]">
          <SheetHeader className="border-b">
            {selectedSync ? (
              <>
                {showBack && (
                  <button
                    type="button"
                    onClick={() => setSelectedSync(null)}
                    className="mb-1 flex w-fit cursor-pointer items-center gap-1 text-xs text-muted transition-colors hover:text-foreground hover:underline"
                  >
                    <ArrowLeftIcon className="size-3" />
                    Select Another Service
                  </button>
                )}
                <SheetTitle>
                  <PkiSyncModalHeader isConfigured={false} destination={selectedSync} />
                </SheetTitle>
              </>
            ) : (
              <>
                <SheetTitle>Add Sync</SheetTitle>
                <SheetDescription>
                  Select a third-party service to sync certificates to.
                </SheetDescription>
              </>
            )}
          </SheetHeader>
          {selectedSync ? (
            <CreatePkiSyncForm
              onComplete={closeSheet}
              onCancel={() => setSelectedSync(null)}
              destination={selectedSync}
              initialData={initialData}
              applicationId={applicationId}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
              <PkiSyncSelect onSelect={setSelectedSync} />
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
            <AlertDialogTitle>Discard sync setup?</AlertDialogTitle>
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

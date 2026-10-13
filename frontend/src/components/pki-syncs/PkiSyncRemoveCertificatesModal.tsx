import { useEffect, useState } from "react";
import { EraserIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@app/components/v3";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import {
  TPkiSync,
  TPkiSyncRemovalOptions,
  useTriggerPkiSyncRemoveCertificates
} from "@app/hooks/api/pkiSyncs";

import {
  hasPkiSyncRemovalOptions,
  PkiSyncRemovalOptionsFields
} from "./PkiSyncRemovalOptionsFields";

type Props = {
  pkiSync?: TPkiSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PkiSyncRemoveCertificatesModal = ({ isOpen, onOpenChange, pkiSync }: Props) => {
  const triggerRemoveCertificates = useTriggerPkiSyncRemoveCertificates();
  const [removalOptions, setRemovalOptions] = useState<TPkiSyncRemovalOptions>({});

  useEffect(() => {
    if (isOpen) setRemovalOptions({});
  }, [isOpen]);

  if (!pkiSync) return null;

  const { id: syncId, destination, projectId } = pkiSync;
  const destinationName = PKI_SYNC_MAP[destination].name;

  const handleTriggerRemoveCertificates = async () => {
    await triggerRemoveCertificates.mutateAsync({
      syncId,
      destination,
      projectId,
      ...(hasPkiSyncRemovalOptions(destination) ? { removalOptions } : {})
    });

    createNotification({
      text: `Successfully triggered certificate removal for ${destinationName} Certificate Sync`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="sm:grid-rows-[auto]!">
          <AlertDialogMedia className="mb-0 sm:row-span-1!">
            <EraserIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove synced certificates from {destinationName}?</AlertDialogTitle>
          <AlertDialogDescription className="sm:col-span-2">
            This deletes the certificates the sync added to {destinationName}. Certificates added
            there any other way stay.
          </AlertDialogDescription>
          {isOpen && hasPkiSyncRemovalOptions(destination) && (
            <div className="mt-2 w-full text-wrap sm:col-span-2">
              <PkiSyncRemovalOptionsFields
                pkiSync={pkiSync}
                value={removalOptions}
                onChange={setRemovalOptions}
              />
            </div>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleTriggerRemoveCertificates}
            isPending={triggerRemoveCertificates.isPending}
          >
            Remove Certificates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

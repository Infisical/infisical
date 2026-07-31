import { DownloadIcon } from "lucide-react";

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
import { TPkiSync, useTriggerPkiSyncImportCertificates } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync?: TPkiSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PkiSyncImportCertificatesModal = ({ isOpen, onOpenChange, pkiSync }: Props) => {
  const triggerImportCertificates = useTriggerPkiSyncImportCertificates();

  if (!pkiSync) return null;

  const { id: syncId, destination, projectId } = pkiSync;
  const destinationName = PKI_SYNC_MAP[destination].name;

  const handleTriggerImportCertificates = async () => {
    await triggerImportCertificates.mutateAsync({
      syncId,
      destination,
      projectId
    });

    createNotification({
      text: `Successfully triggered certificate import for ${destinationName} Certificate Sync`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <DownloadIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Import certificates from {destinationName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This retrieves certificates from {destinationName} and makes them available in
            Infisical. Only certificates that are not already imported will be processed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleTriggerImportCertificates}
            isPending={triggerImportCertificates.isPending}
          >
            Import Certificates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

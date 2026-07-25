import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
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
      text: `Successfully triggered certificate import for ${destinationName} Sync`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Import Certificates</AlertDialogTitle>
          <AlertDialogDescription>
            Retrieve certificates from this {destinationName} destination and make certificates that
            have not already been imported available in Infisical.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="project"
            isPending={triggerImportCertificates.isPending}
            onClick={async (event) => {
              event.preventDefault();
              await handleTriggerImportCertificates();
            }}
          >
            Import Certificates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

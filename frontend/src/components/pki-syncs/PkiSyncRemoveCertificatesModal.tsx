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
import { TPkiSync, useTriggerPkiSyncRemoveCertificates } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync?: TPkiSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PkiSyncRemoveCertificatesModal = ({ isOpen, onOpenChange, pkiSync }: Props) => {
  const triggerRemoveCertificates = useTriggerPkiSyncRemoveCertificates();

  if (!pkiSync) return null;

  const { id: syncId, destination, projectId } = pkiSync;
  const destinationName = PKI_SYNC_MAP[destination].name;

  const handleTriggerRemoveCertificates = async () => {
    await triggerRemoveCertificates.mutateAsync({
      syncId,
      destination,
      projectId
    });

    createNotification({
      text: `Successfully triggered certificate removal for ${destinationName} Sync`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Certificates</AlertDialogTitle>
          <AlertDialogDescription>
            Remove certificates synced by Infisical from this {destinationName} destination?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={triggerRemoveCertificates.isPending}
            onClick={async (event) => {
              event.preventDefault();
              await handleTriggerRemoveCertificates();
            }}
          >
            Remove Certificates
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

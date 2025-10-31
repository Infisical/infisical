import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { TPkiSync, useTriggerPkiSyncImportCertificates } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync?: TPkiSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  pkiSync: TPkiSync;
  onComplete: () => void;
};

const Content = ({ pkiSync, onComplete }: ContentProps) => {
  const { id: syncId, destination, projectId } = pkiSync;
  const destinationName = PKI_SYNC_MAP[destination].name;

  const triggerImportCertificates = useTriggerPkiSyncImportCertificates();

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

    onComplete();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleTriggerImportCertificates();
      }}
    >
      <p className="mb-8 text-sm text-mineshaft-200">
        Are you sure you want to import certificates from this {destinationName} destination into
        Infisical?
      </p>
      <p className="mb-6 text-xs text-bunker-300">
        This operation will retrieve certificates from {destinationName} and make them available in
        your PKI subscriber. Only certificates that are not already imported will be processed.
      </p>
      <div className="mt-8 flex w-full items-center justify-between gap-2">
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button
          type="submit"
          isLoading={triggerImportCertificates.isPending}
          colorSchema="secondary"
        >
          Import Certificates
        </Button>
      </div>
    </form>
  );
};

export const PkiSyncImportCertificatesModal = ({ isOpen, onOpenChange, pkiSync }: Props) => {
  if (!pkiSync) return null;

  const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Import Certificates"
        subTitle={`Import certificates into Infisical from this ${destinationName} Sync destination.`}
      >
        <Content pkiSync={pkiSync} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};

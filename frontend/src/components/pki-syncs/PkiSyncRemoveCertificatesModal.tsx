import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { TPkiSync, useTriggerPkiSyncRemoveCertificates } from "@app/hooks/api/pkiSyncs";

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

  const triggerRemoveCertificates = useTriggerPkiSyncRemoveCertificates();

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

    onComplete();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleTriggerRemoveCertificates();
      }}
    >
      <p className="mb-8 text-sm text-mineshaft-200">
        Are you sure you want to remove certificates synced by Infisical from this {destinationName}{" "}
        destination?
      </p>
      <div className="mt-8 flex w-full items-center justify-between gap-2">
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button type="submit" isLoading={triggerRemoveCertificates.isPending} colorSchema="danger">
          Remove Certificates
        </Button>
      </div>
    </form>
  );
};

export const PkiSyncRemoveCertificatesModal = ({ isOpen, onOpenChange, pkiSync }: Props) => {
  if (!pkiSync) return null;

  const destinationName = PKI_SYNC_MAP[pkiSync.destination].name;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Remove Certificates"
        subTitle={`Remove certificates synced by Infisical from this ${destinationName} Sync destination.`}
      >
        <Content pkiSync={pkiSync} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};

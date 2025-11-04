import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync, useTriggerSecretSyncRemoveSecrets } from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync?: TSecretSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  secretSync: TSecretSync;
  onComplete: () => void;
};

const Content = ({ secretSync, onComplete }: ContentProps) => {
  const { id: syncId, destination, projectId } = secretSync;
  const destinationName = SECRET_SYNC_MAP[destination].name;

  const triggerSyncImport = useTriggerSecretSyncRemoveSecrets();

  const handleTriggerRemoveSecrets = async () => {
    await triggerSyncImport.mutateAsync({
      syncId,
      destination,
      projectId
    });

    createNotification({
      text: `Successfully triggered secret removal for ${destinationName} Sync`,
      type: "success"
    });

    onComplete();
  };

  return (
    <>
      <p className="mb-8 text-sm text-mineshaft-200">
        Are you sure you want to remove synced secrets from this {destinationName} destination?
      </p>
      <div className="mt-8 flex w-full items-center justify-between gap-2">
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button
          isDisabled={triggerSyncImport.isPending}
          isLoading={triggerSyncImport.isPending}
          onClick={handleTriggerRemoveSecrets}
          colorSchema="secondary"
        >
          Remove Secrets
        </Button>
      </div>
    </>
  );
};

export const SecretSyncRemoveSecretsModal = ({ isOpen, onOpenChange, secretSync }: Props) => {
  if (!secretSync) return null;

  const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Remove Secrets"
        subTitle={`Remove synced secrets from this ${destinationName} Sync destination.`}
      >
        <Content secretSync={secretSync} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};

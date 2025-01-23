import { SecretSyncEditFields } from "@app/components/secret-syncs/types";
import { Modal, ModalContent } from "@app/components/v2";
import { TSecretSync } from "@app/hooks/api/secretSyncs";

import { EditSecretSyncForm } from "./forms";
import { SecretSyncModalHeader } from "./SecretSyncModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretSync?: TSecretSync;
  fields: SecretSyncEditFields;
};

export const EditSecretSyncModal = ({ secretSync, onOpenChange, fields, ...props }: Props) => {
  if (!secretSync) return null;

  return (
    <Modal {...props} onOpenChange={onOpenChange}>
      <ModalContent
        title={<SecretSyncModalHeader isConfigured destination={secretSync.destination} />}
        className="max-w-2xl"
        bodyClassName="overflow-visible"
      >
        <EditSecretSyncForm
          onComplete={() => onOpenChange(false)}
          fields={fields}
          secretSync={secretSync}
        />
      </ModalContent>
    </Modal>
  );
};

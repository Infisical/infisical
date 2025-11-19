import { PkiSyncEditFields } from "@app/components/pki-syncs/types";
import { Modal, ModalContent } from "@app/components/v2";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

import { EditPkiSyncForm } from "./forms";
import { PkiSyncModalHeader } from "./PkiSyncModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pkiSync?: TPkiSync;
  fields: PkiSyncEditFields;
};

export const EditPkiSyncModal = ({ pkiSync, onOpenChange, fields, ...props }: Props) => {
  if (!pkiSync) return null;

  const modalClassName = fields === PkiSyncEditFields.Mappings ? "max-w-4xl" : "max-w-2xl";

  return (
    <Modal {...props} onOpenChange={onOpenChange}>
      <ModalContent
        title={<PkiSyncModalHeader isConfigured destination={pkiSync.destination} />}
        className={modalClassName}
        bodyClassName="overflow-visible"
      >
        <EditPkiSyncForm onComplete={() => onOpenChange(false)} fields={fields} pkiSync={pkiSync} />
      </ModalContent>
    </Modal>
  );
};

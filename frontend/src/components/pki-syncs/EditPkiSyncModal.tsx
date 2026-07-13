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

  // z-50 (not the v2 default z-[60]) so the inline "Create Connection" Sheet and its v3 Select
  // menus (all z-50, portaled later) stack above this modal instead of being buried behind it,
  // while the backdrop still covers page chrome up to z-50 by portal order.
  const modalClassName =
    fields === PkiSyncEditFields.Mappings ? "z-50 max-w-4xl" : "z-50 max-w-2xl";

  return (
    <Modal {...props} onOpenChange={onOpenChange}>
      <ModalContent
        overlayClassName="z-50"
        title={<PkiSyncModalHeader isConfigured destination={pkiSync.destination} />}
        className={modalClassName}
        bodyClassName="overflow-visible"
      >
        <EditPkiSyncForm onComplete={() => onOpenChange(false)} fields={fields} pkiSync={pkiSync} />
      </ModalContent>
    </Modal>
  );
};

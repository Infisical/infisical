import { PkiSyncEditFields } from "@app/components/pki-syncs/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/v3";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";

import { EditPkiSyncForm } from "./forms";
import { PkiSyncModalHeader } from "./PkiSyncModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pkiSync?: TPkiSync;
  fields: PkiSyncEditFields;
};

export const EditPkiSyncModal = ({ pkiSync, isOpen, onOpenChange, fields }: Props) => {
  if (!pkiSync) return null;

  const dialogClassName = fields === PkiSyncEditFields.Mappings ? "max-w-4xl" : "max-w-2xl";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={`${dialogClassName} overflow-visible`}>
        <DialogHeader>
          <DialogTitle className="sr-only">Edit PKI Sync</DialogTitle>
          <PkiSyncModalHeader isConfigured destination={pkiSync.destination} />
        </DialogHeader>
        <EditPkiSyncForm onComplete={() => onOpenChange(false)} fields={fields} pkiSync={pkiSync} />
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { PkiSync, TPkiSync } from "@app/hooks/api/pkiSyncs";

import { CreatePkiSyncForm } from "./forms";
import { PkiSyncModalHeader } from "./PkiSyncModalHeader";
import { PkiSyncSelect } from "./PkiSyncSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectSync?: PkiSync | null;
  initialData?: any;
};

type ContentProps = {
  onComplete: (pkiSync: TPkiSync) => void;
  selectedSync: PkiSync | null;
  setSelectedSync: (selectedSync: PkiSync | null) => void;
  initialData?: any;
};

const Content = ({ onComplete, setSelectedSync, selectedSync, initialData }: ContentProps) => {
  if (selectedSync) {
    return (
      <CreatePkiSyncForm
        onComplete={onComplete}
        onCancel={() => setSelectedSync(null)}
        destination={selectedSync}
        initialData={initialData}
      />
    );
  }

  return <PkiSyncSelect onSelect={setSelectedSync} />;
};

export const CreatePkiSyncModal = ({
  onOpenChange,
  selectSync = null,
  initialData,
  ...props
}: Props) => {
  const [selectedSync, setSelectedSync] = useState<PkiSync | null>(selectSync);

  useEffect(() => {
    setSelectedSync(selectSync);
  }, [selectSync]);

  return (
    <Modal
      {...props}
      onOpenChange={(isOpen) => {
        if (!isOpen) setSelectedSync(null);
        onOpenChange(isOpen);
      }}
    >
      <ModalContent
        title={
          selectedSync ? (
            <PkiSyncModalHeader isConfigured={false} destination={selectedSync} />
          ) : (
            "Add Sync"
          )
        }
        className="max-w-3xl"
        bodyClassName="overflow-visible"
        subTitle={
          selectedSync ? undefined : "Select a third-party service to sync certificates to."
        }
      >
        <Content
          onComplete={() => {
            setSelectedSync(null);
            onOpenChange(false);
          }}
          selectedSync={selectedSync}
          setSelectedSync={setSelectedSync}
          initialData={initialData}
        />
      </ModalContent>
    </Modal>
  );
};

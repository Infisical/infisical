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
  applicationId?: string;
};

type ContentProps = {
  onComplete: (pkiSync: TPkiSync) => void;
  selectedSync: PkiSync | null;
  setSelectedSync: (selectedSync: PkiSync | null) => void;
  initialData?: any;
  applicationId?: string;
};

const Content = ({
  onComplete,
  setSelectedSync,
  selectedSync,
  initialData,
  applicationId
}: ContentProps) => {
  if (selectedSync) {
    return (
      <CreatePkiSyncForm
        onComplete={onComplete}
        onCancel={() => setSelectedSync(null)}
        destination={selectedSync}
        initialData={initialData}
        applicationId={applicationId}
      />
    );
  }

  return <PkiSyncSelect onSelect={setSelectedSync} />;
};

export const CreatePkiSyncModal = ({
  onOpenChange,
  selectSync = null,
  initialData,
  applicationId,
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
      {/* z-50 (not the v2 default z-[60]) so the inline "Create Connection" Sheet and its v3 Select
          menus (all z-50, portaled later) stack above this modal instead of being buried behind it,
          while the backdrop still covers page chrome up to z-50 by portal order. */}
      <ModalContent
        overlayClassName="z-50"
        title={
          selectedSync ? (
            <PkiSyncModalHeader isConfigured={false} destination={selectedSync} />
          ) : (
            "Add Sync"
          )
        }
        className="z-50 max-w-3xl"
        bodyClassName={selectedSync ? "overflow-visible" : undefined}
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
          applicationId={applicationId}
        />
      </ModalContent>
    </Modal>
  );
};

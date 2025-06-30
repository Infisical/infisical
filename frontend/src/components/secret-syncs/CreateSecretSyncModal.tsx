import { useEffect, useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { CreateSecretSyncForm } from "./forms";
import { SecretSyncModalHeader } from "./SecretSyncModalHeader";
import { SecretSyncSelect } from "./SecretSyncSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectSync?: SecretSync | null;
};

type ContentProps = {
  onComplete: (secretSync: TSecretSync) => void;
  selectedSync: SecretSync | null;
  setSelectedSync: (selectedSync: SecretSync | null) => void;
};

const Content = ({ onComplete, setSelectedSync, selectedSync }: ContentProps) => {
  if (selectedSync) {
    return (
      <CreateSecretSyncForm
        onComplete={onComplete}
        onCancel={() => setSelectedSync(null)}
        destination={selectedSync}
      />
    );
  }

  return <SecretSyncSelect onSelect={setSelectedSync} />;
};

export const CreateSecretSyncModal = ({ onOpenChange, selectSync = null, ...props }: Props) => {
  const [selectedSync, setSelectedSync] = useState<SecretSync | null>(selectSync);

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
            <SecretSyncModalHeader isConfigured={false} destination={selectedSync} />
          ) : (
            "Add Sync"
          )
        }
        onPointerDownOutside={(e) => e.preventDefault()}
        className="max-w-2xl"
        bodyClassName="overflow-visible"
        subTitle={selectedSync ? undefined : "Select a third-party service to sync secrets to."}
      >
        <Content
          onComplete={() => {
            setSelectedSync(null);
            onOpenChange(false);
          }}
          selectedSync={selectedSync}
          setSelectedSync={setSelectedSync}
        />
      </ModalContent>
    </Modal>
  );
};

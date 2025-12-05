import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { PamResourceType, TPamAccount } from "@app/hooks/api/pam";

import { PamAccountForm } from "./PamAccountForm/PamAccountForm";
import { ResourceSelect } from "./ResourceSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  onComplete?: (account: TPamAccount) => void;
  currentFolderId: string | null;
};

export const PamAddAccountModal = ({
  isOpen,
  onOpenChange,
  projectId,
  onComplete,
  currentFolderId
}: Props) => {
  const [selectedResource, setSelectedResource] = useState<{
    id: string;
    name: string;
    resourceType: PamResourceType;
  } | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when modal closes
      setSelectedResource(null);
    }
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Add Account"
        subTitle="Select a resource to add an account under."
        bodyClassName={selectedResource ? undefined : "overflow-visible"}
      >
        {selectedResource ? (
          <PamAccountForm
            onComplete={(account) => {
              if (onComplete) onComplete(account);
              onOpenChange(false);
            }}
            onBack={() => setSelectedResource(null)}
            resourceId={selectedResource.id}
            resourceName={selectedResource.name}
            resourceType={selectedResource.resourceType}
            projectId={projectId}
            folderId={currentFolderId ?? undefined}
          />
        ) : (
          <ResourceSelect projectId={projectId} onSubmit={(e) => setSelectedResource(e.resource)} />
        )}
      </ModalContent>
    </Modal>
  );
};

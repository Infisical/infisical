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

type ContentProps = {
  onComplete: (account: TPamAccount) => void;
  projectId: string;
  currentFolderId: string | null;
};

const Content = ({ onComplete, projectId, currentFolderId }: ContentProps) => {
  const [selectedResource, setSelectedResource] = useState<{
    id: string;
    name: string;
    resourceType: PamResourceType;
  } | null>(null);

  if (selectedResource) {
    return (
      <PamAccountForm
        onComplete={onComplete}
        onBack={() => setSelectedResource(null)}
        resourceId={selectedResource.id}
        resourceName={selectedResource.name}
        resourceType={selectedResource.resourceType}
        projectId={projectId}
        folderId={currentFolderId ?? undefined}
      />
    );
  }

  return <ResourceSelect projectId={projectId} onSubmit={(e) => setSelectedResource(e.resource)} />;
};

export const PamAddAccountModal = ({
  isOpen,
  onOpenChange,
  projectId,
  onComplete,
  currentFolderId
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Add Account"
        subTitle="Select a resource to add an account under."
        bodyClassName="overflow-visible"
      >
        <Content
          projectId={projectId}
          onComplete={(account) => {
            if (onComplete) onComplete(account);
            onOpenChange(false);
          }}
          currentFolderId={currentFolderId}
        />
      </ModalContent>
    </Modal>
  );
};

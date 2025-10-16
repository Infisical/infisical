import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { PamResourceType, TPamResource } from "@app/hooks/api/pam";

import { PamResourceForm } from "./PamResourceForm";
import { ResourceTypeSelect } from "./ResourceTypeSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  onComplete?: (resource: TPamResource) => void;
};

type ContentProps = {
  onComplete: (resource: TPamResource) => void;
  projectId: string;
};

const Content = ({ onComplete, projectId }: ContentProps) => {
  const [selectedResourceType, setSelectedResourceType] = useState<PamResourceType | null>(null);

  if (selectedResourceType) {
    return (
      <PamResourceForm
        onComplete={onComplete}
        onBack={() => setSelectedResourceType(null)}
        resourceType={selectedResourceType}
        projectId={projectId}
      />
    );
  }

  return <ResourceTypeSelect onSelect={setSelectedResourceType} />;
};

export const PamAddResourceModal = ({ isOpen, onOpenChange, projectId, onComplete }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl" title="Add Resource" subTitle="Select a resource to add.">
        <Content
          projectId={projectId}
          onComplete={(resource) => {
            if (onComplete) onComplete(resource);
            onOpenChange(false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};

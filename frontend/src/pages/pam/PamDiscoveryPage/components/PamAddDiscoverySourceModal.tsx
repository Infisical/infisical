import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { PamDiscoveryType } from "@app/hooks/api/pamDiscovery";

import { PamDiscoverySourceForm } from "./PamDiscoverySourceForm/PamDiscoverySourceForm";
import { DiscoveryTypeSelect } from "./DiscoveryTypeSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

type ContentProps = {
  onComplete: () => void;
  projectId: string;
};

const Content = ({ onComplete, projectId }: ContentProps) => {
  const [selectedType, setSelectedType] = useState<PamDiscoveryType | null>(null);

  if (selectedType) {
    return (
      <PamDiscoverySourceForm
        onComplete={onComplete}
        onBack={() => setSelectedType(null)}
        discoveryType={selectedType}
        projectId={projectId}
      />
    );
  }

  return <DiscoveryTypeSelect onSelect={setSelectedType} />;
};

export const PamAddDiscoverySourceModal = ({ isOpen, onOpenChange, projectId }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Add Discovery Source"
        subTitle="Select a discovery source type to add."
      >
        <Content projectId={projectId} onComplete={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};

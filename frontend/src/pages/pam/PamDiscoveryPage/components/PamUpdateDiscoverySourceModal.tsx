import { Modal, ModalContent } from "@app/components/v2";
import { PAM_DISCOVERY_TYPE_MAP, TPamDiscoverySource } from "@app/hooks/api/pamDiscovery";

import { PamDiscoverySourceForm } from "./PamDiscoverySourceForm/PamDiscoverySourceForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  source?: TPamDiscoverySource;
};

export const PamUpdateDiscoverySourceModal = ({ isOpen, onOpenChange, source }: Props) => {
  if (!source) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Edit Discovery Source"
        subTitle={`Update details for this ${
          PAM_DISCOVERY_TYPE_MAP[source.discoveryType].name
        } discovery source.`}
      >
        <PamDiscoverySourceForm
          onComplete={() => onOpenChange(false)}
          source={source}
          projectId={source.projectId}
        />
      </ModalContent>
    </Modal>
  );
};

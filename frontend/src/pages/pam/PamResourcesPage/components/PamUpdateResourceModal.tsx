import { Modal, ModalContent } from "@app/components/v2";
import { PAM_RESOURCE_TYPE_MAP, TPamResource } from "@app/hooks/api/pam";

import { PamResourceForm } from "./PamResourceForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  resource?: TPamResource;
};

export const PamUpdateResourceModal = ({ isOpen, onOpenChange, resource }: Props) => {
  if (!resource) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Edit Resource"
        subTitle={`Update details for this ${
          PAM_RESOURCE_TYPE_MAP[resource.resourceType].name
        } resource.`}
      >
        <PamResourceForm
          onComplete={() => onOpenChange(false)}
          resource={resource}
          projectId={resource.projectId}
        />
      </ModalContent>
    </Modal>
  );
};

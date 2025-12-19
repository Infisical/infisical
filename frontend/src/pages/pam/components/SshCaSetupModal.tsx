import { Button, Modal, ModalContent } from "@app/components/v2";

import { SshCaSetupSection } from "./SshCaSetupSection";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  resourceId: string;
};

export const SshCaSetupModal = ({ isOpen, onOpenChange, resourceId }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Certificate Authentication Setup"
        subTitle="If you plan to use certificate-based authentication, configure the target host to trust the CA certificate."
      >
        <SshCaSetupSection resourceId={resourceId} isOptional />
        <div className="mt-6 flex justify-end">
          <Button colorSchema="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};

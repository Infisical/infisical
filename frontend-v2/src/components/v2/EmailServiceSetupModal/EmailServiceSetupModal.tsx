import { Button } from "../Button";
import { Modal, ModalContent } from "../Modal";

type Props = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

export const EmailServiceSetupModal = ({ isOpen, onOpenChange }: Props): JSX.Element => (
  <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
    <ModalContent title="Email service not configured">
      <p className="mb-4 text-bunker-300">
        The administrators of this Infisical instance have not yet set up an email service provider
        required to perform this action
      </p>

      <a href="https://infisical.com/docs/self-hosting/configuration/email">
        <Button className="mr-4">Learn more</Button>
      </a>
    </ModalContent>
  </Modal>
);

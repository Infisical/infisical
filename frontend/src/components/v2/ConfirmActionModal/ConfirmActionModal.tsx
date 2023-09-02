
import { useToggle } from "@app/hooks";

import { Button } from "../Button";
import { Modal, ModalClose, ModalContent } from "../Modal";

type Props = {
  isOpen?: boolean;
  onClose?: () => void;
  title: string;
  subTitle?: string;
  onConfrimApproved: () => Promise<void>;
};

export const ConfirmActionModal = ({
  isOpen,
  onClose,
  onConfrimApproved,
  title,
  subTitle = "This action is irreversible!"
}: Props): JSX.Element => {
  const [isLoading, setIsLoading] = useToggle();

  const onDelete = async () => {
    setIsLoading.on();
    try {
      await onConfrimApproved();
    } catch {
      setIsLoading.off();
    } finally {
      setIsLoading.off();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
    >
      <ModalContent
        title={title}
        subTitle={subTitle}
        footerContent={
          <div className="flex items-center">
            <Button
              className="mr-4"
              colorSchema="danger"
              onClick={onDelete}
              isLoading={isLoading}
            >
              Confirm
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary" onClick={onClose}>
                Cancel
              </Button>
            </ModalClose>{" "}
          </div>
        }
        onClose={onClose}
      >
        <p className="text-gray-300">
            Are you sure you want to proceed?
        </p>
      </ModalContent>
    </Modal>
  );
};

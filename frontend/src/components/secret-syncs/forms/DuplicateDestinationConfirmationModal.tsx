import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
};

export const DuplicateDestinationConfirmationModal = ({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg" title="Duplicate Destination Configuration">
        <div className="mb-4 text-sm">
          <p>
            Another secret sync in your organization is already configured with the same
            destination. Proceeding may cause conflicts or overwrite existing data.
          </p>
          <p className="mt-2">Are you sure you want to continue?</p>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <ModalClose asChild>
            <Button
              onClick={onConfirm}
              colorSchema="danger"
              isLoading={isLoading}
              isDisabled={isLoading}
            >
              Continue
            </Button>
          </ModalClose>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain" isDisabled={isLoading}>
              Cancel
            </Button>
          </ModalClose>
        </div>
      </ModalContent>
    </Modal>
  );
};

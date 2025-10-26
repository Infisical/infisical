import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  duplicateProjectId?: string;
};

export const DuplicateDestinationConfirmationModal = ({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading,
  duplicateProjectId
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg" title="Duplicate Destination Configuration">
        <div className="mb-4 text-sm">
          <p>
            Another secret sync in your organization is already configured with the same
            destination. Proceeding may cause conflicts or overwrite existing data.
          </p>
          {duplicateProjectId && (
            <p className="mt-2 text-xs text-mineshaft-400">
              Duplicate found in project ID:{" "}
              <code className="rounded-sm bg-mineshaft-600 px-1 py-0.5 text-mineshaft-200">
                {duplicateProjectId}
              </code>
            </p>
          )}
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

import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  duplicateProjectId?: string;
  isDisabled?: boolean;
};

export const DuplicateDestinationConfirmationModal = ({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading,
  duplicateProjectId,
  isDisabled
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg" title="Duplicate Destination Configuration">
        <div className="mb-4 text-sm">
          <p>
            Another secret sync in your organization is already configured with the same
            destination.{" "}
            <span className={isDisabled ? "text-red-400" : ""}>
              {isDisabled
                ? "Your organization does not allow duplicate destination configurations."
                : "Proceeding may cause conflicts or overwrite existing data."}
            </span>
          </p>
          {duplicateProjectId && (
            <p className="mt-2 text-xs text-mineshaft-400">
              Duplicate found in project ID:{" "}
              <code className="rounded-sm bg-mineshaft-600 px-1 py-0.5 text-mineshaft-200">
                {duplicateProjectId}
              </code>
            </p>
          )}
          {!isDisabled && <p className="mt-2">Are you sure you want to continue?</p>}
        </div>

        {!isDisabled && (
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
        )}
      </ModalContent>
    </Modal>
  );
};

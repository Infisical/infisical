import { Button, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
};

export const PlatformManagedConfirmationModal = ({ isOpen, onOpenChange, onConfirm }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl" title="Platform Managed Credentials">
        <NoticeBannerV2 title="Are you sure you want have Infisical manage the credentials of this connection?">
          <p className="my-1 text-sm text-mineshaft-300">
            Once created, Infisical will update the password of this connection.
          </p>
          <p className="text-sm text-mineshaft-300">
            You will not be able to access the updated password.
          </p>
        </NoticeBannerV2>
        <div className="mt-4 flex gap-2">
          <ModalClose asChild>
            <Button
              onClick={onConfirm}
              className="mr-4"
              size="sm"
              type="submit"
              colorSchema="secondary"
            >
              Grant Infisical Ownership
            </Button>
          </ModalClose>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </ModalContent>
    </Modal>
  );
};

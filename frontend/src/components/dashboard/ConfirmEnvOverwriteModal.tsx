import { Button, Modal, ModalContent } from "../v2";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onOverwriteConfirm: (preserve: "old" | "new") => void;
  duplicateKeys: string[];
};

const ConfirmEnvOverwriteModal = ({
  isOpen,
  onClose,
  duplicateKeys,
  onOverwriteConfirm
}: Props): JSX.Element => {
  return (
    <Modal isOpen={isOpen}>
      <ModalContent
        title="Duplicate Secrets"
        footerContent={
          <div className="flex items-center gap-4">
            <Button colorSchema="primary" onClick={() => onOverwriteConfirm("old")}>
              Keep Old
            </Button>
            <Button colorSchema="danger" onClick={() => onOverwriteConfirm("new")}>
              Overwrite
            </Button>
          </div>
        }
        onClose={onClose}
      >
        <div className="flex flex-col gap-2">
          <p className='text-gray-400'>Your file contains the following duplicate secrets:</p>
          <p className="text-sm text-gray-500">{duplicateKeys.join(", ")}</p>
          <p className='text-md text-gray-400'>Are you sure you want to overwrite these secrets?</p>
        </div>
      </ModalContent>
    </Modal>
  );
};

export default ConfirmEnvOverwriteModal;

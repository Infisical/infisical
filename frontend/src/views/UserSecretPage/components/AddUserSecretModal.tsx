import { Modal, ModalContent } from "@app/components/v2";
import { UserSecretForm } from "./userSecretForm";

type Props = {
  isOpen: boolean;
  mode: "create" | "edit";
  handlePopUpToggle: (
    type: "createUserSecret" | "editSecret",
    isOpen: boolean,
  ) => void;
  initialData?: any;
  secretId?: string;
  
};

export const AddUserSecretModal = ({  handlePopUpToggle, isOpen, initialData, secretId, mode }: Props) => {
  
  const isEditMode = mode === "edit";
  const modalTitle = isEditMode ? 'Edit User Secret' : 'Add User Secret';
  
  const handleClose = () => {
    handlePopUpToggle(
      isEditMode ? "editSecret" : "createUserSecret",
      false
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
    >
      <ModalContent
        title={modalTitle}
        onClose={handleClose}
      >
        <div className="mt-4">
          <UserSecretForm
            mode={mode}
            initialData={initialData}
            secretId={secretId}
            onSuccess={handleClose}
          />
        </div>
      </ModalContent>
    </Modal>
  );
};
import { type FC } from "react"
import { Modal, ModalContent, Button } from "@app/components/v2";

type Props = {
  isModalOpen: boolean;
  handleDeleteSecret: () => void;
  toggleModal: () => void;
};

export const DeleteSecretModal: FC<Props> = ( { isModalOpen, toggleModal, handleDeleteSecret }) => {
  return (
    <>
      <Modal isOpen={isModalOpen}>
      <ModalContent
        title="Confirm Secret Deletion"
        onClose={toggleModal}
        footerContent={
          <div className="flex items-center gap-4">
            <Button colorSchema="primary" onClick={() => toggleModal()}>
              Cancel
            </Button>

            <Button colorSchema="danger" onClick={() => handleDeleteSecret()}>
              Delete
            </Button>
          </div>
        }> 
        <p>Are you sure you want to delete this secret ?</p>
      </ModalContent>
      </Modal>
    </>
  )
}

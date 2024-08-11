import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserSecretForm } from "./UserSecretForm";

type Props = {
  popUp: UsePopUpState<["addOrUpdateUserSecret"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addOrUpdateUserSecret"]>) => void;
};

export const AddUserSecretModal = ({ popUp, handlePopUpClose }: Props) => {
  return (
    <Modal
      isOpen={popUp?.addOrUpdateUserSecret?.isOpen}
      onOpenChange={() => {
        handlePopUpClose("addOrUpdateUserSecret");
      }}
    >
      <ModalContent
        title={popUp?.addOrUpdateUserSecret?.data?.isEditMode ? "Update secret" : "Add a Secret"}
        subTitle="Store different types of secrets, like credit card details, web logins, and secure note"
      >
        <UserSecretForm popUp={popUp} handlePopUpClose={handlePopUpClose} />
      </ModalContent>
    </Modal>
  );
};

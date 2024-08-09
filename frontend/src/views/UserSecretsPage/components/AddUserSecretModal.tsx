import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserSecretForm } from "./UserSecretForm";

type Props = {
  popUp: UsePopUpState<["addNewUserSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addNewUserSecret"]>,
    state?: boolean
  ) => void;
};

export const AddUserSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.addNewUserSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addNewUserSecret", isOpen);
      }}
    >
      <ModalContent
        title="Add a Secret"
        subTitle="Store different types of secrets, like credit card details, web logins, and secure note"
      >
        <UserSecretForm />
      </ModalContent>
    </Modal>
  );
};

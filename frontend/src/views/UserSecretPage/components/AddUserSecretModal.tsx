import { Modal, ModalContent } from "@app/components/v2";
import { UserSecretType } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserSecretWebLoginForm } from "./UserSecretWebLoginForm";

export const AddUserSecretModal = ({
  popUp,
  handlePopUpToggle
}: {
  popUp: UsePopUpState<["createUserSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createUserSecret"]>,
    state?: boolean
  ) => void;
}) => {
  return (
    <Modal
      isOpen={popUp?.createUserSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createUserSecret", isOpen);
      }}
    >
      {/* One day we can use different forms according to the different types, or handle the field types dynamically in a dynamic form component... but let's set a fixed value/component for MVP reasons :) */}
      <ModalContent
        title="Create a Web Login Secret"
        subTitle="This secret is only accessible by you."
      >
        <UserSecretWebLoginForm
          secretType={UserSecretType.Login}
          onCreate={() => {
            handlePopUpToggle("createUserSecret", false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};

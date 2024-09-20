import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserSecretForm } from "./UserSecretForm";

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
      <ModalContent title="Create a Secret" subTitle="This secret is only accessible by you.">
        <UserSecretForm
          isPublic={false}
          value={(popUp.createUserSecret.data as { value?: string })?.value}
        />
      </ModalContent>
    </Modal>
  );
};

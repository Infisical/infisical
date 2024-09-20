import { Modal, ModalContent } from "@app/components/v2";
import { UserSecretType } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserSecretWebLoginForm } from "./UserSecretWebLoginForm";

export const ViewUserSecretModal = ({
  popUp,
  handlePopUpToggle
}: {
  popUp: UsePopUpState<["viewSecret"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["viewSecret"]>, state?: boolean) => void;
}) => {
  return (
    <Modal
      isOpen={popUp?.viewSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("viewSecret", isOpen);
      }}
    >
      <ModalContent
        title="Create a Web Login Secret"
        subTitle="This secret is only accessible by you."
      >
        <UserSecretWebLoginForm
          readOnly
          value={popUp.viewSecret.data}
          secretType={UserSecretType.Login}
          onCreate={() => {
            handlePopUpToggle("viewSecret", false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};

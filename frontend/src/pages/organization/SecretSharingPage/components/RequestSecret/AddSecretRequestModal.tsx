import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { RequestSecretForm } from "./RequestSecretForm";

type Props = {
  popUp: UsePopUpState<["createSecretRequest"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSecretRequest"]>,
    state?: boolean
  ) => void;
};

export const AddSecretRequestModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.createSecretRequest?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createSecretRequest", isOpen);
      }}
    >
      <ModalContent
        title="Request a Secret"
        subTitle="Securely request one off secrets from your team or people outside your organization."
      >
        <RequestSecretForm />
      </ModalContent>
    </Modal>
  );
};

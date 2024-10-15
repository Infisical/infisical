import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AddConsumerSecretForm } from "./AddConsumerSecretForm";

type Props = {
  popUp: UsePopUpState<["createConsumerSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createConsumerSecret"]>,
    state?: boolean
  ) => void;
  handlePopUpClose: (
    popUpName: keyof UsePopUpState<["createConsumerSecret"]>
  ) => void;
};

export const AddConsumerSecretModal = ({ popUp, handlePopUpToggle, handlePopUpClose }: Props) => {
  return (
    <Modal
      isOpen={popUp?.createConsumerSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createConsumerSecret", isOpen);
      }}
    >
      <ModalContent
        title="Create new consumer secret"
        subTitle="Securely store your secrets like login credentials, credit card details, etc"
      >
        <AddConsumerSecretForm handlePopUpClose={handlePopUpClose} />
      </ModalContent>
    </Modal>
  );
};

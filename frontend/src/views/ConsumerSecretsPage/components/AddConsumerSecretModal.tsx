import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { ShareSecretForm } from "@app/views/ShareSecretPublicPage/components";
import { AddConsumerSecretForm } from "./AddConsumerSecretForm";

type Props = {
  popUp: UsePopUpState<["createConsumerSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createConsumerSecret"]>,
    state?: boolean
  ) => void;
};

export const AddConsumerSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
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
        <AddConsumerSecretForm />
      </ModalContent>
    </Modal>
  );
};

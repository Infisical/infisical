import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AddUserSecretsForm } from "./AddUserSecretsFrom";

type Props = {
  popUp: UsePopUpState<["createSharedSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSharedSecret"]>,
    state?: boolean
  ) => void;
};

export const AddUserSecretsModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.createSharedSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createSharedSecret", isOpen);

      }}
    >
      <ModalContent
        title="Add Credential"
        subTitle="Please provide the details for the new credential."
      >
        <AddUserSecretsForm
          closeModal={() => {
          handlePopUpToggle("createSharedSecret", false);
          
        }}
          // isPublic={false}
          // value={(popUp.createSharedSecret.data as { value?: string })?.value}
        />

        
      </ModalContent>
    </Modal>
  );
};

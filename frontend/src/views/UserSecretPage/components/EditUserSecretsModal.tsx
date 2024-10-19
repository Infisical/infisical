import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { EditUserSecretsForm } from "./EditUserSecretsForm";

type Props = {
  popUp: UsePopUpState<["editCredentials"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["editCredentials"]>,
    state?: boolean
  ) => void;
};


export const EditUserSecretsModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.editCredentials?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("editCredentials", isOpen);
      }}
    >
      <ModalContent
        title="Edit Credential"
        subTitle="Update the details of your credential."
      >
        <EditUserSecretsForm
          // isPublic={false}
          // value={(popUp.editCredentials.data as { value?: string })?.value}
        />

        
      </ModalContent>
    </Modal>
  );
};

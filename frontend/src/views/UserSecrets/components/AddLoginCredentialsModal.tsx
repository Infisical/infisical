import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CreateLoginCredentialsForm } from "./CreateLoginCredentialsForm";

type AddModalProps = {
    popUp: UsePopUpState<["createUserLoginCredentials"]>;
    handlePopUpToggle: (
        popUpName: keyof UsePopUpState<["createUserLoginCredentials"]>,
        state?: boolean
    ) => void;
}
export const AddLoginCredentialsModal = ({
    popUp,
    handlePopUpToggle
}:AddModalProps) => {
    return (
        <Modal
          isOpen={popUp?.createUserLoginCredentials?.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("createUserLoginCredentials", isOpen);
          }}
        >
          <ModalContent
            title="Add Login Credentials"
            subTitle="Securely add login credentials to your account."
          >
            <CreateLoginCredentialsForm
            />
          </ModalContent>
        </Modal>
    )
}
import { Modal, ModalContent } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { UserSecretsForm } from "./UserSecretsForm";

type Props = {
  popUp: UsePopUpState<["createUserSecrets"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createUserSecrets"]>,
    state?: boolean
  ) => void;
};

export const AddUserSecretsModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Modal
      isOpen={popUp?.createUserSecrets?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createUserSecrets", isOpen);
      }}
    >
      <ModalContent
        title="Create a User Secret"
        subTitle="This will only be available to you"
      >
        <UserSecretsForm
          value={(popUp.createUserSecrets.data as { value?: string })?.value}
        />
      </ModalContent>
    </Modal>
  );
};

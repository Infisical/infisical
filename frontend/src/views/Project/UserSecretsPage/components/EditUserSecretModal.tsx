import { Button, Modal, ModalContent } from "@app/components/v2";
import { SecretV3RawSanitized } from "@app/hooks/api/types";
import { UserSecretType } from "@app/hooks/api/userSecrets/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { LoginSecretForm } from "./forms/LoginSecretForm";

type Props = {
  secret: SecretV3RawSanitized;
  popUp: UsePopUpState<["editUserSecret"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["editUserSecret"]>, state?: boolean) => void;
};

export const EditUserSecretModal = ({ secret, popUp, handlePopUpToggle }: Props) => {
  const data = JSON.parse(secret.value ?? "{}");

  const renderForm = (secretType: string) => {
    switch (secretType) {
      case UserSecretType.Login: {
        return (
          <LoginSecretForm
            initialData={{
              ...data,
              secretKey: secret.key
            }}
            onSubmit={() => handlePopUpToggle("editUserSecret", false)}
          />
        );
      }
      default: {
        return null;
      }
    }
  };
  return (
    <Modal
      isOpen={popUp?.editUserSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("editUserSecret", isOpen);
      }}
    >
      <ModalContent title="Edit Secret" subTitle="">
        <div className="space-y-4">
          <h2>Edit {data.type} Secret</h2>
          {renderForm(data.type)}
          <div className="flex justify-end">
            <Button form="edit-secret-form" type="submit">
              Edit
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};

import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useUpdateUserSecret } from "@app/hooks/api/userSecrets";
import { UserSecret, UserSecretFormData,UserSecretType } from "@app/hooks/api/userSecrets/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CreditCardForm } from "../AddUserSecretModal/forms/CreditCardForm";
import { SecureNoteForm } from "../AddUserSecretModal/forms/SecureNoteForm";
import { WebLoginForm } from "../AddUserSecretModal/forms/WebLoginForm";

type Props = {
  secret: UserSecret;
  popUp: UsePopUpState<["editUserSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["editUserSecret"]>,
    state?: boolean
  ) => void;
};

export const EditUserSecretModal = ({ secret, popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const updateUserSecret = useUpdateUserSecret(currentOrg?.id || "");
  
  const { control, handleSubmit, reset } = useForm<UserSecretFormData>({
    defaultValues: {
      name: secret.name,
      type: secret.type,
      data: secret.data
    }
  });

  useEffect(() => {
    if (popUp.editUserSecret.isOpen) {
      reset({
        name: secret.name,
        type: secret.type,
        data: secret.data
      });
    }
  }, [popUp.editUserSecret.isOpen, secret, reset]);

  const onSubmit = async (formData: UserSecretFormData) => {
    try {
      await updateUserSecret.mutateAsync({
        id: secret.id,
        name: formData.name,
        data: formData.data
      });
      handlePopUpToggle("editUserSecret", false);
      createNotification({
        text: "Successfully updated user secret",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update user secret",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp.editUserSecret.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("editUserSecret", isOpen)}
    >
      <ModalContent
        title={`Edit ${secret.name}`}
        subTitle="Update your secret details"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {secret.type === UserSecretType.WEB_LOGIN && (
            <WebLoginForm control={control} />
          )}
          
          {secret.type === UserSecretType.CREDIT_CARD && (
            <CreditCardForm control={control} />
          )}
          
          {secret.type === UserSecretType.SECURE_NOTE && (
            <SecureNoteForm control={control} />
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handlePopUpToggle("editUserSecret", false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={updateUserSecret.isLoading}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}; 
import { useEffect } from "react";
import { Control, useForm } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useUpdateUserSecret } from "@app/hooks/api/userSecrets";
import { 
  CreditCardFormData,
  SecureNoteFormData,
  UserSecret, 
  UserSecretType,
  WebLoginFormData
} from "@app/hooks/api/userSecrets/types";
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

type FormData = WebLoginFormData | CreditCardFormData | SecureNoteFormData;

const getDefaultValues = (secret: UserSecret): FormData => {
    switch (secret.type) {
      case UserSecretType.WEB_LOGIN:
        return {
          name: secret.name,
          data: {
            type: UserSecretType.WEB_LOGIN,
            data: secret.data
          }
        } as WebLoginFormData;
      case UserSecretType.CREDIT_CARD:
        return {
          name: secret.name,
          data: {
            type: UserSecretType.CREDIT_CARD,
            data: secret.data
          }
        } as CreditCardFormData;
      case UserSecretType.SECURE_NOTE:
        return {
          name: secret.name,
          data: {
            type: UserSecretType.SECURE_NOTE,
            data: secret.data
          }
        } as SecureNoteFormData;
      default:
        throw new Error("Invalid secret type");
    }
  };

export const EditUserSecretModal = ({ secret, popUp, handlePopUpToggle }: Props) => {
  const updateUserSecret = useUpdateUserSecret();

  const { control, handleSubmit, reset } = useForm<FormData>({
    defaultValues: getDefaultValues(secret)
  });

  useEffect(() => {
    if (popUp.editUserSecret.isOpen) {
      switch (secret.type) {
        case UserSecretType.WEB_LOGIN:
          reset({
            name: secret.name,
            data: {
              type: UserSecretType.WEB_LOGIN,
              data: secret.data
            }
          } as WebLoginFormData);
          break;
        case UserSecretType.CREDIT_CARD:
          reset({
            name: secret.name,
            data: {
              type: UserSecretType.CREDIT_CARD,
              data: secret.data
            }
          } as CreditCardFormData);
          break;
        case UserSecretType.SECURE_NOTE:
          reset({
            name: secret.name,
            data: {
              type: UserSecretType.SECURE_NOTE,
              data: secret.data
            }
          } as SecureNoteFormData);
          break;
        default:
          throw new Error("Invalid secret type");
      }
    }
  }, [popUp.editUserSecret.isOpen, secret, reset]);

  const onSubmit = async (formData: FormData) => {
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
            <WebLoginForm control={control as Control<WebLoginFormData>} />
          )}
          
          {secret.type === UserSecretType.CREDIT_CARD && (
            <CreditCardForm control={control as Control<CreditCardFormData>} />
          )}
          
          {secret.type === UserSecretType.SECURE_NOTE && (
            <SecureNoteForm control={control as Control<SecureNoteFormData>} />
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
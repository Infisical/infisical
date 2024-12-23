import { useEffect } from "react";
import { Control, useForm } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import {
  CreditCardFormData,
  SecureNoteFormData,
  UserSecret,
  UserSecretType,
  useUpdateUserSecret,
  WebLoginFormData
} from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CreditCardForm } from "../AddUserSecretModal/forms/CreditCardForm";
import { SecureNoteForm } from "../AddUserSecretModal/forms/SecureNoteForm";
import { WebLoginForm } from "../AddUserSecretModal/forms/WebLoginForm";
import { SecretTypeSelect } from "../AddUserSecretModal/SecretTypeSelect";

type Props = {
  popUp: UsePopUpState<["editUserSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["editUserSecret"]>,
    state?: boolean
  ) => void;
  secret: UserSecret | null;
};

type FormData = WebLoginFormData | CreditCardFormData | SecureNoteFormData;

export const EditUserSecretModal = ({ popUp, handlePopUpToggle, secret }: Props) => {
  const updateUserSecret = useUpdateUserSecret();

  const { control, handleSubmit, reset } = useForm<FormData>({
    defaultValues: {
      name: "",
      data: {
        type: UserSecretType.WEB_LOGIN,
        data: { url: "", username: "", password: "" }
      }
    }
  });

  // Set form data when secret changes
  useEffect(() => {
    if (secret) {
      reset({
        name: secret.name,
        data: {
          type: secret.type,
          data: secret.data
        }
      } as FormData);
    }
  }, [secret, reset]);

  // Reset form when modal closes
  useEffect(() => {
    if (!popUp.editUserSecret.isOpen) {
      reset();
    }
  }, [popUp.editUserSecret.isOpen, reset]);

  const onSubmit = async (formData: FormData) => {
    if (!secret) return;

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

  const selectedType = secret?.type;

  console.log({selectedType});

  return (
    <Modal
      isOpen={popUp.editUserSecret.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("editUserSecret", isOpen)}
    >
      <ModalContent
        title="Edit User Secret"
        subTitle="Update your stored credentials"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <SecretTypeSelect control={control} disabled />

          {selectedType === UserSecretType.WEB_LOGIN && (
            <WebLoginForm control={control as Control<WebLoginFormData>} isEditing />
          )}
          {selectedType === UserSecretType.CREDIT_CARD && (
            <CreditCardForm control={control as Control<CreditCardFormData>} isEditing />
          )}
          {selectedType === UserSecretType.SECURE_NOTE && (
            <SecureNoteForm control={control as Control<SecureNoteFormData>} isEditing />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handlePopUpToggle("editUserSecret", false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={updateUserSecret.isLoading}>
              Update Secret
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};

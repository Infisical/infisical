import { useEffect } from "react";
import { Control, useForm } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import {
  CreditCardFormData,
  SecureNoteFormData,
  useCreateUserSecret,
  UserSecretType,
  WebLoginFormData
} from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CreditCardForm } from "./forms/CreditCardForm";
import { SecureNoteForm } from "./forms/SecureNoteForm";
import { WebLoginForm } from "./forms/WebLoginForm";
import { SecretTypeSelect } from "./SecretTypeSelect";

type Props = {
  popUp: UsePopUpState<["createUserSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createUserSecret"]>,
    state?: boolean
  ) => void;
};

type FormData = WebLoginFormData | CreditCardFormData | SecureNoteFormData;

export const AddUserSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const createUserSecret = useCreateUserSecret();

  const { control, handleSubmit, watch, reset } = useForm<FormData>({
    defaultValues: {
      name: "",
      data: {
        type: UserSecretType.WEB_LOGIN,
        data: { url: "", username: "", password: "" }
      }
    }
  });

  const selectedType = watch("data.type");

  // Reset form when modal closes
  useEffect(() => {
    if (!popUp.createUserSecret.isOpen) {
      switch (selectedType) {
        case UserSecretType.WEB_LOGIN:
          reset({
            name: "",
            data: {
              type: UserSecretType.WEB_LOGIN,
              data: { url: "", username: "", password: "" }
            }
          });
          break;
        case UserSecretType.CREDIT_CARD:
          reset({
            name: "",
            data: {
              type: UserSecretType.CREDIT_CARD,
              data: { cardNumber: "", expiryDate: "", cvv: "" }
            }
          });
          break;
        case UserSecretType.SECURE_NOTE:
          reset({
            name: "",
            data: {
              type: UserSecretType.SECURE_NOTE,
              data: { content: "" }
            }
          });
          break;
        default:
          throw new Error("Invalid secret type");
      }
    }
  }, [popUp.createUserSecret.isOpen, reset, selectedType]);

  const onSubmit = async (formData: FormData) => {
    try {
      await createUserSecret.mutateAsync(formData);
      handlePopUpToggle("createUserSecret", false);
      createNotification({
        text: "Successfully created user secret",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create user secret",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp.createUserSecret.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("createUserSecret", isOpen)}
    >
      <ModalContent
        title="Add User Secret"
        subTitle="Store and manage your personal credentials securely"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <SecretTypeSelect control={control} />

          {selectedType === UserSecretType.WEB_LOGIN && (
            <WebLoginForm control={control as Control<WebLoginFormData>} />
          )}
          {selectedType === UserSecretType.CREDIT_CARD && (
            <CreditCardForm control={control as Control<CreditCardFormData>} />
          )}
          {selectedType === UserSecretType.SECURE_NOTE && (
            <SecureNoteForm control={control as Control<SecureNoteFormData>} />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handlePopUpToggle("createUserSecret", false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createUserSecret.isLoading}>
              Save Secret
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};

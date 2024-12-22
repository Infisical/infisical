import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { CreateUserSecretDTO, useCreateUserSecret, UserSecretType } from "@app/hooks/api/userSecrets";
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

type FormData = {
  type: UserSecretType;
  name: string;
  data: CreateUserSecretDTO["data"];
};

export const AddUserSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const createUserSecret = useCreateUserSecret(currentOrg?.id || "");
  
  const { control, handleSubmit, watch, reset } = useForm<FormData>({
    defaultValues: {
      type: UserSecretType.WEB_LOGIN,
      name: "",
      data: { url: "", username: "", password: "" } // Default to web login data
    }
  });

  const selectedType = watch("type");

  useEffect(() => {
    if (!popUp.createUserSecret.isOpen) {
      reset();
    }
  }, [popUp.createUserSecret.isOpen, reset]);

  // Reset data when type changes
  useEffect(() => {
    let newData: CreateUserSecretDTO["data"];
    if (selectedType === UserSecretType.WEB_LOGIN) {
      newData = { url: "", username: "", password: "" };
    } else if (selectedType === UserSecretType.CREDIT_CARD) {
      newData = { cardNumber: "", expiryDate: "", cvv: "" };
    } else {
      newData = { content: "" };
    }

    reset(values => ({
      ...values,
      data: newData
    }));
  }, [selectedType, reset]);

  const onSubmit = async (formData: FormData) => {
    try {
      await createUserSecret.mutateAsync({
        ...formData,
        organizationId: currentOrg?.id || ""
      });
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
            <WebLoginForm control={control} />
          )}
          
          {selectedType === UserSecretType.CREDIT_CARD && (
            <CreditCardForm control={control} />
          )}
          
          {selectedType === UserSecretType.SECURE_NOTE && (
            <SecureNoteForm control={control} />
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handlePopUpToggle("createUserSecret", false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={createUserSecret.isLoading}
            >
              Save Secret
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}; 
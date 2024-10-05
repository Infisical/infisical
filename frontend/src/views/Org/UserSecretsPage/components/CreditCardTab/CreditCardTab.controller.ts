import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { usePopUp } from "@app/hooks";
import {
  useCreateUserSecret,
  useDeleteUserSecret,
  useGetUserSecrets,
  useUpdateUserSecret} from "@app/hooks/api/userSecrets";
import { TabTypes } from "@app/pages/org/[id]/user-secrets/user-secrets.types";

const creditCardValidateRegex = /^\d{16}$/;
const expiryValidateRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
const cvvValidateRegex = /^\d{3}$/;

const creditCardValidationSchema = z.object({
  card_number: z.string().length(16, "Card number must be 16 digits").refine(value => creditCardValidateRegex.test(value), {"message": "Credit card number must only contain digits"}),
  expiry: z.string().refine(value => expiryValidateRegex.test(value), {"message": "Expiry date must be in MM/YY format"}),
  cvv: z.string().length(3, "CVV must be 3 digits").refine((value) => cvvValidateRegex.test(value), {"message": "CVV must only contain digits"})
})

export const useCreditCardTab = () => {
    const { isLoading, isError, data } = useGetUserSecrets(TabTypes.CreditCard);
  const deleteUserSecret = useDeleteUserSecret(TabTypes.CreditCard);
  const createUserSecret = useCreateUserSecret(TabTypes.CreditCard);
  const updateUserSecret = useUpdateUserSecret(TabTypes.CreditCard);

  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createUserSecret",
    "deleteUserSecretConfirmation",
    "editUserSecret"
  ] as const);

  const onDeleteApproved = async () => {
    try {
      await deleteUserSecret.mutateAsync(popUp.deleteUserSecretConfirmation.data as string);
      createNotification({
        text: "Successfully deleted secret",
        type: "success"
      });

      handlePopUpClose("deleteUserSecretConfirmation");
    } catch (error) {
      console.log(error);
      createNotification({
        text: "Failed to delete secret",
        type: "error"
      });
    }
  };

  const onCreateFormModalProps = {
    isOpen: popUp.createUserSecret.isOpen,
    onOpenChange: (isOpen: boolean) => handlePopUpToggle("createUserSecret", isOpen),
    title: "Enter your card numner",
    subtitle: "We will keep it safe"
  };

  const onCreateFormProps = {
    defaultValues: {
        card_number: "",
        expiry: "",
        cvv: ""
    },
    schema: creditCardValidationSchema,
    onSubmit: async (formdata: any) => {
      try {
        await createUserSecret.mutateAsync({
          title: TabTypes.CreditCard,
          fields: formdata,
          credentialType: TabTypes.CreditCard
        });
        createNotification({
          text: "Successfully created a secret",
          type: "success"
        });
        handlePopUpClose("createUserSecret");
      } catch (error) {
        console.error(error);
        createNotification({
          text: "Failed to create a secret",
          type: "error"
        });
      }
    },
    submitText: "Create"
  };

  const secretsTableProps = {
    onDelete: (id: string) => {
      handlePopUpOpen("deleteUserSecretConfirmation", id);
    },
    columns: ["Card Number", "Expiry Date", "CVV", "Created At"],
    isLoading,
    secrets: data?.secrets,
    onEdit: (id: string) => {
      handlePopUpOpen("editUserSecret", id);
    }
  };

  const deleteActionModalProps = {
    isOpen: popUp.deleteUserSecretConfirmation.isOpen,
    title: "Are you sure you want to delete this secret?",
    onChange: (isOpen: boolean) => handlePopUpToggle("deleteUserSecretConfirmation", isOpen),
    deleteKey: "delete",
    onClose: () => handlePopUpClose("deleteUserSecretConfirmation"),
    onDeleteApproved
  };

  const getEditFormModalProps = {
    isOpen: popUp.editUserSecret.isOpen,
    onOpenChange: (isOpen: boolean) => handlePopUpToggle("editUserSecret", isOpen),
    title: "Edit your card details",
    subtitle: "We will keep it safe"
  };

  const getEditFormProps = () => {
    const formdata = data?.secrets.find((secret) => secret.id === popUp.editUserSecret.data)?.fields;
    return {
      defaultValues: {
        card_number: formdata?.card_number ?? "",
        expiry: formdata?.expiry ?? "",
        cvv: formdata?.cvv ?? ""
      },
      schema: creditCardValidationSchema,
      onSubmit: async (onEditFormData: any) => {
        try {
          await updateUserSecret.mutateAsync({
            id: popUp.editUserSecret.data,
            fields: onEditFormData,
          });
          createNotification({
            text: "Successfully updated a secret",
            type: "success"
          });
          handlePopUpClose("editUserSecret");
        } catch (error) {
          console.error(error);
          createNotification({
            text: "Failed to update a secret",
            type: "error"
          });
        }
      },
      submitText: "Create"
    }
  };
  
  const onClickCreateSecret = () => {
    handlePopUpOpen("createUserSecret");
  }

  return {
    isLoading,
    isError,
    onCreateFormModalProps,
    onCreateFormProps,
    secretsTableProps,
    deleteActionModalProps,
    getEditFormModalProps,
    getEditFormProps,
    onClickCreateSecret
  }
}
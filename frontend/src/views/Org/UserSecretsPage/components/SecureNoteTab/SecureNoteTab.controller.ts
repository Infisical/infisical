import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { usePopUp } from "@app/hooks";
import {
  useCreateUserSecret,
  useDeleteUserSecret,
  useGetUserSecrets,
  useUpdateUserSecret
} from "@app/hooks/api/userSecrets";
import { TabTypes } from "@app/pages/org/[id]/user-secrets/user-secrets.types";

export const useUserSecretNodeTab = () => {
  const { isLoading, isError, data } = useGetUserSecrets(TabTypes.SecureNote);
  const deleteUserSecret = useDeleteUserSecret(TabTypes.SecureNote);
  const createUserSecret = useCreateUserSecret(TabTypes.SecureNote);
  const updateUserSecret = useUpdateUserSecret(TabTypes.SecureNote);

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
    title: "Create a Secure Note",
    subtitle: "We will keep it safe"
  };

  const onCreateFormProps = {
    defaultValues: {
      title: "",
      content: "",
    },
    schema: z.object({
      title: z.string().min(1, "Title is required"),
      content: z.string().min(1, "Content is required"),
    }),
    onSubmit: async (formdata: any) => {
      try {
        await createUserSecret.mutateAsync({
          title: TabTypes.SecureNote,
          fields: formdata,
          credentialType: TabTypes.SecureNote
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
    columns: ["Title", "Content", "Created At"],
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
    title: "Edit your secure note",
    subtitle: "We will keep it safe"
  };

  const getEditFormProps = () => {
    const formdata = data?.secrets.find(
      (secret) => secret.id === popUp.editUserSecret.data
    )?.fields;
    return {
      defaultValues: {
        title: formdata?.title ?? "",
        content: formdata?.content ?? "",
      },
      schema: z.object({
        title: z.string().min(1, "Title is required"),
        content: z.string().min(1, "Content is required"),
      }),
      onSubmit: async (onEditFormData: any) => {
        try {
          await updateUserSecret.mutateAsync({
            id: popUp.editUserSecret.data,
            fields: onEditFormData
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
    };
  };

  const onClickCreateSecret = () => {
    handlePopUpOpen("createUserSecret");
  };

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
  };
};

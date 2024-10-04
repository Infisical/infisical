import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import {
  useCreateUserSecret,
  useDeleteUserSecret,
  useGetUserSecrets,
  useUpdateUserSecret} from "@app/hooks/api/userSecrets";
import { TabTypes } from "@app/pages/org/[id]/user-secrets/user-secrets.types";

import { FormModal } from "./Form/FormModal";
import UserSecretForm from "./Form/UserForm";
import SecretsTable from "./SecretsTable";

const WebLoginTab = () => {
  const { isLoading, isError, data } = useGetUserSecrets();
  const deleteUserSecret = useDeleteUserSecret();
  const createUserSecret = useCreateUserSecret();
  const updateUserSecret = useUpdateUserSecret();

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
    title: "Create a Web Login",
    subtitle: "Create a web login secret"
  };

  const onCreateFormProps = {
    defaultValues: {
      username: "",
      password: "",
      url: ""
    },
    schema: z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      url: z.string().min(1, "URL is required")
    }),
    onSubmit: async (formdata: any) => {
      try {
        await createUserSecret.mutateAsync({
          title: TabTypes.WebLogin,
          fields: formdata,
          credentialType: TabTypes.WebLogin
        });
        createNotification({
          text: "Successfully created a shared secret",
          type: "success"
        });
        handlePopUpClose("createUserSecret");
      } catch (error) {
        console.error(error);
        createNotification({
          text: "Failed to create a shared secret",
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
    columns: ["Username", "Password", "URL", "Created At"],
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
    title: "Edit Web Login",
    subtitle: "Edit a web login secret"
  };

  const getEditFormProps = () => {
    const formdata = data?.secrets.find((secret) => secret.id === popUp.editUserSecret.data)?.fields;
    return {
      defaultValues: {
        username: formdata?.username ?? "",
        password: formdata?.password ?? "",
        url: formdata?.url ?? ""
      },
      schema: z.object({
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
        url: z.string().min(1, "URL is required")
      }),
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

  if (isError && !isLoading) {
    return <div>Error...</div>;
  }
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Web Login</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            handlePopUpOpen("createUserSecret");
          }}
        >
          Create Secret
        </Button>
      </div>
      <SecretsTable {...secretsTableProps} />
      <FormModal {...onCreateFormModalProps}>
        <UserSecretForm {...onCreateFormProps} />
      </FormModal>
      <FormModal {...getEditFormModalProps}>
        <UserSecretForm {...getEditFormProps()} />
      </FormModal>
      <DeleteActionModal {...deleteActionModalProps} />
    </div>
  );
};

export default WebLoginTab;

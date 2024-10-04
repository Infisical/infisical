import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import {
  useCreateUserSecret,
  useDeleteUserSecret,
  useGetUserSecrets} from "@app/hooks/api/userSecrets";
import { TabTypes } from "@app/pages/org/[id]/user-secrets/user-secrets.types";

import { FormModal } from "./Form/FormModal";
import UserSecretForm from "./Form/UserForm";
import SecretsTable from "./SecretsTable";

const WebLoginTab = () => {
  const { isLoading, isError, data } = useGetUserSecrets();
  const deleteUserSecret = useDeleteUserSecret();
  const createUserSecret = useCreateUserSecret();

  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createUserSecret",
    "deleteUserSecretConfirmation"
  ] as const);

  const columns = ["Username", "Password", "URL", "Created At"];

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

  const handleDeletePopupOpen = (id: string) => {
    handlePopUpOpen("deleteUserSecretConfirmation", id);
  };

  const formModalProps = {
    isOpen: popUp.createUserSecret.isOpen,
    onOpenChange: (isOpen: boolean) => handlePopUpToggle("createUserSecret", isOpen),
    title: "Create a Web Login",
    subtitle: "Create a web login secret"
  };

  const formProps = {
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
        handlePopUpClose("createUserSecret")
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
      <SecretsTable
        onDelete={handleDeletePopupOpen}
        columns={columns}
        isLoading={false}
        secrets={data?.secrets}
      />
      <FormModal {...formModalProps}>
        <UserSecretForm {...formProps} />
      </FormModal>
      <DeleteActionModal
        isOpen={popUp.deleteUserSecretConfirmation.isOpen}
        title="Are you sure you want to delete this secret?"
        onChange={(isOpen) => handlePopUpToggle("deleteUserSecretConfirmation", isOpen)}
        deleteKey="delete"
        onClose={() => handlePopUpClose("deleteUserSecretConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};

export default WebLoginTab;

import Head from "next/head";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";

import { AddUserSecretsModal } from "./AddUserSecretModal";
import { UserSecretsTable } from "./UserSecretsTable";
import { useDeleteUserSecret } from "@app/hooks/api/userSecrets";
import { UpdateUserSecretsModal } from "./UpdateUserSecretModal";

type DeleteModalData = { id: string };

export const UserSecretsSection = () => {
  const deleteUserSecret = useDeleteUserSecret();
  const { 
    popUp, 
    handlePopUpToggle, 
    handlePopUpClose, 
    handlePopUpOpen 
  } = usePopUp([
    "createUserSecrets",
    "updateUserSecrets",
    "deleteUserSecretsConfirmation"
  ] as const);

  const onDeleteApproved = async () => {
    try {
      deleteUserSecret.mutateAsync({
        userSecretId: (popUp?.deleteUserSecretsConfirmation?.data as DeleteModalData)?.id
      });
      createNotification({
        text: "Successfully deleted shared secret",
        type: "success"
      });

      handlePopUpClose("deleteUserSecretsConfirmation");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete shared secret",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <Head>
        <title>User Secrets</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">User Secrets</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            handlePopUpOpen("createUserSecrets");
          }}
        >
          Create Secret
        </Button>
      </div>
      <UserSecretsTable handlePopUpOpen={handlePopUpOpen} />
      <AddUserSecretsModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <UpdateUserSecretsModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteUserSecretsConfirmation.isOpen}
        title="Delete user secret?"
        onChange={(isOpen) => handlePopUpToggle("deleteUserSecretsConfirmation", isOpen)}
        deleteKey={(popUp?.deleteUserSecretsConfirmation?.data as DeleteModalData)?.id}
        onClose={() => handlePopUpClose("deleteUserSecretsConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};

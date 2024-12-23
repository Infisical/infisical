import { useState } from "react";
import Head from "next/head";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useDeleteUserSecret, UserSecret } from "@app/hooks/api/userSecrets";

import { AddUserSecretModal } from "./AddUserSecretModal/AddUserSecretModal";
import { EditUserSecretModal } from "./EditUserSecretModal/EditUserSecretModal";
import { UserSecretsTable } from "./UserSecretsTable/UserSecretsTable";

export const UserSecretsSection = () => {
  const deleteUserSecret = useDeleteUserSecret();
  const [selectedSecret, setSelectedSecret] = useState<UserSecret | null>(null);
  
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createUserSecret",
    "editUserSecret",
    "deleteUserSecret"
  ] as const);

  const handleEditSecret = (secret: UserSecret) => {
    setSelectedSecret(secret);
    handlePopUpToggle("editUserSecret", true);
  };

  const handleEditModalClose = () => {
    setSelectedSecret(null);
    handlePopUpToggle("editUserSecret", false);
  };

  const onDeleteApproved = async () => {
    try {
      const secretId = (popUp.deleteUserSecret.data as { id: string })?.id;
      if (!secretId) return;

      await deleteUserSecret.mutateAsync(secretId);
      handlePopUpClose("deleteUserSecret");
    } catch (err) {
      console.error(err);
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
        <p className="text-xl font-semibold text-mineshaft-100">Shared Secrets</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => handlePopUpToggle("createUserSecret", true)}
        >
          Add Secret
        </Button>
      </div>
     

      <UserSecretsTable 
        handlePopUpOpen={handlePopUpOpen}
        onEditSecret={handleEditSecret}
      />

      <AddUserSecretModal 
        popUp={popUp} 
        handlePopUpToggle={handlePopUpToggle} 
      />

      <EditUserSecretModal
        secret={selectedSecret}
        popUp={popUp}
        handlePopUpToggle={handleEditModalClose}
      />

      <DeleteActionModal
        isOpen={popUp.deleteUserSecret.isOpen}
        title={`Delete ${
          (popUp.deleteUserSecret.data as { name: string })?.name || ""
        } secret?`}
        onChange={(isOpen) => handlePopUpToggle("deleteUserSecret", isOpen)}
        deleteKey={(popUp.deleteUserSecret.data as { name: string })?.name}
        onClose={() => handlePopUpClose("deleteUserSecret")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
}; 
import Head from "next/head";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, DeleteActionModal } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteUserSecret } from "@app/hooks/api/userSecrets";

import { AddUserSecretModal } from "./AddUserSecretModal/AddUserSecretModal";
import { EditUserSecretModal } from "./EditUserSecretModal/EditUserSecretModal";
import { UserSecretsTable } from "./UserSecretsTable/UserSecretsTable";

export const UserSecretsSection = () => {
  const { currentOrg } = useOrganization();
  const deleteUserSecret = useDeleteUserSecret(currentOrg?.id || "");
  
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createUserSecret",
    "editUserSecret",
    "deleteUserSecret"
  ]);

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
     

      <UserSecretsTable handlePopUpOpen={handlePopUpOpen} />

      <AddUserSecretModal 
        popUp={popUp} 
        handlePopUpToggle={handlePopUpToggle} 
      />

      {popUp.editUserSecret.isOpen && (
        <EditUserSecretModal
          secret={popUp.editUserSecret.data as any} // TODO: Fix type
          popUp={popUp}
          handlePopUpToggle={handlePopUpToggle}
        />
      )}

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
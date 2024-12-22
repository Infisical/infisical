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
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            onClick={() => handlePopUpToggle("createUserSecret", true)}
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Add Secret
          </Button>
        </div>
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
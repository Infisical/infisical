import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useDeleteUserSecret } from "@app/hooks/api/userSecrets";

import { AddUserSecretButton } from "./components/AddUserSecretButton";
import { AddUserSecretModal } from "./components/AddUserSecretModal";
import { UserSecretsTable } from "./components/UserSecretsTable";

type DeleteModalData = { name: string; id: string };

export const UserSecretPage = () => {
  const deleteUserSecret = useDeleteUserSecret();
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "createUserSecret",
    "updateUserSecret",
    "deleteUserSecretConfirmation",
    "misc"
  ] as const);

  const onDeleteApproved = async () => {
    try {
      deleteUserSecret.mutateAsync({
        userSecretId: (popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.id
      });
      createNotification({
        text: "Successfully deleted shared secret",
        type: "success"
      });

      handlePopUpClose("deleteUserSecretConfirmation");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete shared secret",
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto px-6 text-mineshaft-50 dark:[color-scheme:dark]">
      <div className="space-y-8">
        <div className="mt-6">
          <p className="text-3xl font-semibold text-bunker-100">User Secrets</p>
          <p className="text-md text-bunker-300">
            These secrets are only accessible by you. You can inject secrets using
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/cli/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical CLI
            </a>
            ,
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/documentation/getting-started/api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical API
            </a>
            ,
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/sdks/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Infisical SDKs
            </a>
            , and
            <a
              className="ml-1 text-mineshaft-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
              href="https://infisical.com/docs/documentation/getting-started/introduction"
              target="_blank"
              rel="noopener noreferrer"
            >
              more
            </a>
            .
          </p>
        </div>
        <div className="flex items-center justify-between">
          <div />
          <div className="flex flex-row items-center justify-center space-x-2">
            <div>
              <AddUserSecretButton popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
            </div>
          </div>
        </div>
      </div>
      <UserSecretsTable handlePopUpOpen={handlePopUpOpen} />
      <AddUserSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteUserSecretConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name || " "
        } shared secret?`}
        onChange={(isOpen) => handlePopUpToggle("deleteUserSecretConfirmation", isOpen)}
        deleteKey={(popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteUserSecretConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};

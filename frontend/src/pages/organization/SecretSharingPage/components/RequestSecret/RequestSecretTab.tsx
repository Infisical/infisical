import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useDeleteSecretRequest } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddSecretRequestModal } from "./AddSecretRequestModal";
import { RequestedSecretsTable } from "./RequestedSecretsTable";
import { RevealSecretValueModal } from "./RevealSecretValueModal";

type DeleteModalData = { name: string; id: string };

export const RequestSecretTab = () => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createSecretRequest",
    "deleteSecretRequestConfirmation",
    "revealSecretRequestValue"
  ] as const);

  const { mutateAsync: deleteSecretRequest } = useDeleteSecretRequest();

  const onDeleteApproved = async () => {
    await deleteSecretRequest({
      secretRequestId: popUp.deleteSecretRequestConfirmation.data?.id
    });
    createNotification({
      text: "Successfully deleted secret request",
      type: "success"
    });

    handlePopUpClose("deleteSecretRequestConfirmation");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-medium text-mineshaft-100">Secret Requests</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            handlePopUpOpen("createSecretRequest");
          }}
        >
          Request Secret
        </Button>
      </div>
      <RequestedSecretsTable handlePopUpOpen={handlePopUpOpen} />
      <AddSecretRequestModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <RevealSecretValueModal
        isOpen={popUp.revealSecretRequestValue.isOpen}
        popUp={popUp}
        onOpenChange={(isOpen) => handlePopUpToggle("revealSecretRequestValue", isOpen)}
      />
      <DeleteActionModal
        isOpen={popUp.deleteSecretRequestConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteSecretRequestConfirmation?.data as DeleteModalData)?.name || " "
        } secret request?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSecretRequestConfirmation", isOpen)}
        deleteKey={(popUp?.deleteSecretRequestConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteSecretRequestConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};

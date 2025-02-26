import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useDeleteSecretRequest } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AddSecretRequestModal } from "./AddSecretRequestModal";
import { RequestedSecretsTable } from "./RequestedSecretsTable";
import { RevealSecretValueModal } from "./RevealSecretValueModal";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["createSecretRequest", "deleteSecretRequestConfirmation", "revealSecretRequestValue"]
    >,
    data?: any
  ) => void;
  popUp: UsePopUpState<
    ["createSecretRequest", "deleteSecretRequestConfirmation", "revealSecretRequestValue"]
  >;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<
      ["createSecretRequest", "deleteSecretRequestConfirmation", "revealSecretRequestValue"]
    >,
    state?: boolean
  ) => void;
  handlePopUpClose: (
    popUpName: keyof UsePopUpState<["deleteSecretRequestConfirmation", "revealSecretRequestValue"]>
  ) => void;
};

type DeleteModalData = { name: string; id: string };

export const RequestSecretTab = ({
  handlePopUpOpen,
  popUp,
  handlePopUpToggle,
  handlePopUpClose
}: Props) => {
  const { mutateAsync: deleteSecretRequest } = useDeleteSecretRequest();

  const onDeleteApproved = async () => {
    try {
      await deleteSecretRequest({
        secretRequestId: popUp.deleteSecretRequestConfirmation.data?.id
      });
      createNotification({
        text: "Successfully deleted secret request",
        type: "success"
      });

      handlePopUpClose("deleteSecretRequestConfirmation");
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
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Secret Requests</p>
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

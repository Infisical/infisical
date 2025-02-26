import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useDeleteSharedSecret } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AddShareSecretModal } from "./AddShareSecretModal";
import { ShareSecretsTable } from "./ShareSecretsTable";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["createSharedSecret", "deleteSharedSecretConfirmation"]>,
    data?: any
  ) => void;
  popUp: UsePopUpState<["createSharedSecret", "deleteSharedSecretConfirmation"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSharedSecret", "deleteSharedSecretConfirmation"]>,
    state?: boolean
  ) => void;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation"]>) => void;
};

type DeleteModalData = { name: string; id: string };

export const ShareSecretTab = ({
  handlePopUpOpen,
  popUp,
  handlePopUpToggle,
  handlePopUpClose
}: Props) => {
  const deleteSecretShare = useDeleteSharedSecret();

  const onDeleteApproved = async () => {
    try {
      deleteSecretShare.mutateAsync({
        sharedSecretId: (popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.id
      });
      createNotification({
        text: "Successfully deleted shared secret",
        type: "success"
      });

      handlePopUpClose("deleteSharedSecretConfirmation");
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
        <p className="text-xl font-semibold text-mineshaft-100">Shared Secrets</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            handlePopUpOpen("createSharedSecret");
          }}
        >
          Share Secret
        </Button>
      </div>
      <ShareSecretsTable handlePopUpOpen={handlePopUpOpen} />
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteSharedSecretConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.name || " "
        } shared secret?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSharedSecretConfirmation", isOpen)}
        deleteKey={(popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteSharedSecretConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};

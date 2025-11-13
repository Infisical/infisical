import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, IconButton } from "@app/components/v2";
import { useDeleteProjectIdentityMembership } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityAddToProjectModal } from "./IdentityAddToProjectModal";
import { IdentityProjectsTable } from "./IdentityProjectsTable";

type Props = {
  identityId: string;
};

export const IdentityProjectsSection = ({ identityId }: Props) => {
  const { mutateAsync: deleteMutateAsync } = useDeleteProjectIdentityMembership();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addIdentityToProject",
    "removeIdentityFromProject"
  ] as const);

  const onRemoveIdentitySubmit = async (id: string, projectId: string) => {
    await deleteMutateAsync({
      identityId: id,
      projectId
    });

    createNotification({
      text: "Successfully removed identity from project",
      type: "success"
    });

    handlePopUpClose("removeIdentityFromProject");
  };

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Projects</h3>
        <IconButton
          ariaLabel="copy icon"
          variant="plain"
          className="group relative"
          onClick={() => {
            handlePopUpOpen("addIdentityToProject");
          }}
        >
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </div>
      <div className="py-4">
        <IdentityProjectsTable identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
      </div>
      <DeleteActionModal
        isOpen={popUp.removeIdentityFromProject.isOpen}
        title={`Are you sure you want to remove ${
          (popUp?.removeIdentityFromProject?.data as { identityName: string })?.identityName || ""
        } from ${
          (popUp?.removeIdentityFromProject?.data as { projectName: string })?.projectName || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeIdentityFromProject", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() => {
          const popupData = popUp?.removeIdentityFromProject?.data as {
            identityId: string;
            projectId: string;
          };

          return onRemoveIdentitySubmit(popupData.identityId, popupData.projectId);
        }}
      />
      <IdentityAddToProjectModal
        identityId={identityId}
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
      />
    </div>
  );
};

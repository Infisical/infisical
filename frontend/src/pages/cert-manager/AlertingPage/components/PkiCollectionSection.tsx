import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeletePkiCollection } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiCollectionModal } from "./PkiCollectionModal";
import { PkiCollectionTable } from "./PkiCollectionTable";

export const PkiCollectionSection = () => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { mutateAsync: deletePkiCollection } = useDeletePkiCollection();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiCollection",
    "deletePkiCollection"
  ] as const);

  const onRemovePkiCollectionSubmit = async (collectionId: string) => {
    try {
      if (!projectId) return;

      await deletePkiCollection({
        collectionId,
        projectId
      });

      createNotification({
        text: "Successfully deleted PKI collection",
        type: "success"
      });

      handlePopUpClose("deletePkiCollection");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete PKI collection",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Certificate Collections</p>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.PkiCollections}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("pkiCollection")}
              isDisabled={!isAllowed}
            >
              Create
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <PkiCollectionTable handlePopUpOpen={handlePopUpOpen} />
      <PkiCollectionModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deletePkiCollection.isOpen}
        title={`Are you sure you want to remove the alert ${
          (popUp?.deletePkiCollection?.data as { name: string })?.name || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deletePkiCollection", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemovePkiCollectionSubmit(
            (popUp?.deletePkiCollection?.data as { collectionId: string })?.collectionId
          )
        }
      />
    </div>
  );
};

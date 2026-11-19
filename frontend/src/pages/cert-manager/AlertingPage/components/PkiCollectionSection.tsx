import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useDeletePkiCollection } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiCollectionModal } from "./PkiCollectionModal";
import { PkiCollectionTable } from "./PkiCollectionTable";

export const PkiCollectionSection = () => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const { mutateAsync: deletePkiCollection } = useDeletePkiCollection();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiCollection",
    "deletePkiCollection"
  ] as const);

  const onRemovePkiCollectionSubmit = async (collectionId: string) => {
    if (!projectId) return;

    await deletePkiCollection({
      collectionId
    });

    createNotification({
      text: "Successfully deleted PKI collection",
      type: "success"
    });

    handlePopUpClose("deletePkiCollection");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate Collections</CardTitle>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.PkiCollections}
          >
            {(isAllowed) => (
              <Button
                type="submit"
                onClick={() => handlePopUpOpen("pkiCollection")}
                isDisabled={!isAllowed}
                variant="project"
              >
                <FontAwesomeIcon icon={faPlus} />
                Create
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <PkiCollectionTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <PkiCollectionModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <ConfirmationAlertDialog
        isOpen={popUp.deletePkiCollection.isOpen}
        description="This action is irreversible."
        title={`Are you sure you want to remove the alert ${
          (popUp?.deletePkiCollection?.data as { name: string })?.name || ""
        }?`}
        onOpenChange={(isOpen) => handlePopUpToggle("deletePkiCollection", isOpen)}
        confirmKey="confirm"
        onConfirm={() =>
          onRemovePkiCollectionSubmit(
            (popUp?.deletePkiCollection?.data as { collectionId: string })?.collectionId
          )
        }
      />
    </Card>
  );
};

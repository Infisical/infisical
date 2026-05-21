import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteWsTag } from "@app/hooks/api";

import { AddSecretTagModal } from "./AddSecretTagModal";
import { SecretTagsTable } from "./SecretTagsTable";

type DeleteModalData = { name: string; id: string };

export const SecretTagsSection = (): JSX.Element => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "CreateSecretTag",
    "deleteTagConfirmation"
  ] as const);
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const deleteWsTag = useDeleteWsTag();
  const deleteTagData = popUp?.deleteTagConfirmation?.data as DeleteModalData | undefined;

  const onDeleteApproved = async () => {
    if (!deleteTagData?.id) return;
    await deleteWsTag.mutateAsync({
      projectId: currentProject?.id || "",
      tagID: deleteTagData.id
    });

    createNotification({
      text: "Successfully deleted tag",
      type: "success"
    });

    handlePopUpClose("deleteTagConfirmation");
    setDeleteConfirmation("");
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Secret Tags</CardTitle>
        <CardDescription>
          Every secret can be assigned to one or more tags. Here you can add and remove tags for the
          current project.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Tags}>
            {(isAllowed) => (
              <Button
                variant="project"
                size="xs"
                onClick={() => {
                  handlePopUpOpen("CreateSecretTag");
                }}
                isDisabled={!isAllowed}
              >
                <PlusIcon className="size-4" />
                Create Tag
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        {permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags) ? (
          <SecretTagsTable handlePopUpOpen={handlePopUpOpen} />
        ) : (
          <PermissionDeniedBanner />
        )}
      </CardContent>
      <AddSecretTagModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <AlertDialog
        open={popUp.deleteTagConfirmation.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("deleteTagConfirmation", isOpen);
          if (!isOpen) setDeleteConfirmation("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tag? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="w-full pb-4">
            <p className="mb-2 text-sm text-muted">
              Enter the tag slug{" "}
              <span className="font-medium text-foreground">{deleteTagData?.name ?? ""}</span> to
              confirm the deletion
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={deleteTagData?.name ?? ""}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={onDeleteApproved}
              disabled={!deleteTagData?.name || deleteConfirmation !== deleteTagData.name}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

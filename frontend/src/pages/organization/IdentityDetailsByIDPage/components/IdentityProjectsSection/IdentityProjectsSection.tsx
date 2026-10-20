import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
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
  CardTitle
} from "@app/components/v3";
import {
  useDeleteProjectIdentityMembership,
  useGetIdentityProjectMemberships
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityAddToProjectModal } from "./IdentityAddToProjectModal";
import { IdentityProjectsTable } from "./IdentityProjectsTable";

type Props = {
  identityId: string;
};

type RemoveIdentityPopUpData = {
  identityId: string;
  identityName: string;
  projectId: string;
  projectName: string;
};

export const IdentityProjectsSection = ({ identityId }: Props) => {
  const { mutateAsync: deleteMutateAsync, isPending: isRemoving } =
    useDeleteProjectIdentityMembership();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addIdentityToProject",
    "removeIdentityFromProject"
  ] as const);

  const removeIdentityData = popUp.removeIdentityFromProject.data as
    | RemoveIdentityPopUpData
    | undefined;

  const onRemoveIdentitySubmit = async () => {
    if (!removeIdentityData) return;

    await deleteMutateAsync({
      identityId: removeIdentityData.identityId,
      projectId: removeIdentityData.projectId
    });

    createNotification({
      text: "Successfully removed identity from project",
      type: "success"
    });

    handlePopUpClose("removeIdentityFromProject");
  };

  const { data: projectMemberships } = useGetIdentityProjectMemberships(identityId);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Manage machine identity project memberships</CardDescription>
          {Boolean(projectMemberships?.length) && (
            <CardAction>
              <Button
                onClick={() => {
                  handlePopUpOpen("addIdentityToProject");
                }}
                size="xs"
                variant="outline"
              >
                <PlusIcon />
                Add to Project
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <IdentityProjectsTable identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
        </CardContent>
      </Card>
      <AlertDialog
        open={popUp.removeIdentityFromProject.isOpen}
        confirmationValue="confirm"
        onOpenChange={(isOpen) => {
          if (!isOpen && isRemoving) return;
          handlePopUpToggle("removeIdentityFromProject", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Identity From Project</AlertDialogTitle>
            <AlertDialogDescription>
              Remove{" "}
              <span className="font-medium text-foreground">
                {removeIdentityData?.identityName ?? "this identity"}
              </span>{" "}
              from{" "}
              <span className="font-medium text-foreground">
                {removeIdentityData?.projectName ?? "this project"}
              </span>
              . The identity loses all access it has through this project membership.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            inputProps={{ disabled: isRemoving }}
            onConfirm={() => onRemoveIdentitySubmit().catch(() => undefined)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                onRemoveIdentitySubmit().catch(() => undefined);
              }}
            >
              Remove From Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <IdentityAddToProjectModal
        identityId={identityId}
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
      />
    </>
  );
};

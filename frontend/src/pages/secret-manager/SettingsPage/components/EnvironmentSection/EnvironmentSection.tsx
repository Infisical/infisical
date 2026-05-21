import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
  useProjectPermission,
  useSubscription
} from "@app/context";
import { useDeleteWsEnvironment } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddEnvironmentModal } from "./AddEnvironmentModal";
import { EnvironmentTable } from "./EnvironmentTable";
import { UpdateEnvironmentModal } from "./UpdateEnvironmentModal";

export const EnvironmentSection = () => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const deleteWsEnvironment = useDeleteWsEnvironment();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const isMoreEnvironmentsAllowed =
    subscription?.environmentLimit && currentProject?.environments
      ? currentProject.environments.length < subscription.environmentLimit
      : true;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createEnv",
    "updateEnv",
    "deleteEnv",
    "upgradePlan"
  ] as const);

  const deleteEnvData = popUp?.deleteEnv?.data as
    | { name: string; slug: string; id: string }
    | undefined;

  const onEnvDeleteSubmit = async () => {
    if (!currentProject?.id || !deleteEnvData?.id) return;

    await deleteWsEnvironment.mutateAsync({
      projectId: currentProject.id,
      id: deleteEnvData.id
    });

    createNotification({
      text: "Successfully deleted environment",
      type: "success"
    });

    handlePopUpClose("deleteEnv");
    setDeleteConfirmation("");
  };

  return (
    <Card id="environments" className="mb-6 scroll-m-6">
      <CardHeader>
        <CardTitle>Environments</CardTitle>
        <CardDescription>
          Choose which environments will show up in your dashboard like development, staging,
          production.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Environments}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                size="xs"
                onClick={() => {
                  if (isMoreEnvironmentsAllowed) {
                    handlePopUpOpen("createEnv");
                  } else {
                    handlePopUpOpen("upgradePlan");
                  }
                }}
                isDisabled={!isAllowed}
              >
                <PlusIcon className="size-4" />
                Create Environment
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        {permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments) ? (
          <EnvironmentTable handlePopUpOpen={handlePopUpOpen} />
        ) : (
          <PermissionDeniedBanner />
        )}
      </CardContent>
      <AddEnvironmentModal
        isOpen={popUp.createEnv.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createEnv", isOpen)}
      />
      <UpdateEnvironmentModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
      <AlertDialog
        open={popUp.deleteEnv.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("deleteEnv", isOpen);
          if (!isOpen) setDeleteConfirmation("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Environment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this environment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="w-full pb-4">
            <p className="mb-2 text-sm text-muted">
              Enter the environment slug{" "}
              <span className="font-medium text-foreground">{deleteEnvData?.slug ?? ""}</span> to
              confirm the deletion
            </p>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder={deleteEnvData?.slug ?? ""}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={onEnvDeleteSubmit}
              disabled={!deleteEnvData?.slug || deleteConfirmation !== deleteEnvData.slug}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have reached the maximum number of environments allowed on the free plan. Upgrade to Infisical Pro plan to add more environments."
      />
    </Card>
  );
};

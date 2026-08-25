import { useState } from "react";
import { addDays, format } from "date-fns";
import { PlusIcon, TriangleAlertIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner, ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
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
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { useDeleteWsEnvironment, useRestoreEnvironment } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddEnvironmentModal } from "./AddEnvironmentModal";
import { EnvironmentTable } from "./EnvironmentTable";
import { UpdateEnvironmentModal } from "./UpdateEnvironmentModal";

export const EnvironmentSection = () => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const deleteWsEnvironment = useDeleteWsEnvironment();
  const restoreEnvironment = useRestoreEnvironment();
  const [isTableMutationPending, setIsTableMutationPending] = useState(false);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
  const [isRestoreSubmitting, setIsRestoreSubmitting] = useState(false);

  const isDeletePending = deleteWsEnvironment.isPending || isDeleteSubmitting;
  const isRestorePending = restoreEnvironment.isPending || isRestoreSubmitting;
  const isExternalMutationPending = isDeletePending || isRestorePending;

  const isMoreEnvironmentsAllowed =
    subscription?.environmentLimit && currentProject?.environments
      ? currentProject.environments.length < subscription.environmentLimit
      : true;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createEnv",
    "updateEnv",
    "deleteEnv",
    "restoreEnv",
    "hardDeleteEnv",
    "upgradePlan"
  ] as const);

  const deleteEnvData = popUp?.deleteEnv?.data as
    | { name: string; slug: string; id: string }
    | undefined;

  const hardDeleteEnvData = popUp?.hardDeleteEnv?.data as
    | { name: string; slug: string; id: string; deleteAfter?: string }
    | undefined;

  const restoreEnvData = popUp?.restoreEnv?.data as
    | { name: string; slug: string; id: string }
    | undefined;

  const onEnvDeleteSubmit = async () => {
    if (!currentProject?.id || !deleteEnvData?.id || isDeletePending) return;

    setIsDeleteSubmitting(true);

    try {
      await deleteWsEnvironment.mutateAsync({
        projectId: currentProject.id,
        id: deleteEnvData.id
      });

      createNotification({
        text: "Environment scheduled for deletion",
        type: "success"
      });

      handlePopUpClose("deleteEnv");
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  const onSwitchToHardDelete = () => {
    if (!deleteEnvData || isDeletePending) return;
    handlePopUpClose("deleteEnv");
    handlePopUpOpen("hardDeleteEnv", deleteEnvData);
  };

  const onEnvRestoreSubmit = async () => {
    if (!currentProject?.id || !restoreEnvData?.id || isRestorePending) return;

    setIsRestoreSubmitting(true);

    try {
      await restoreEnvironment.mutateAsync({
        projectId: currentProject.id,
        id: restoreEnvData.id
      });

      createNotification({
        text: "Successfully restored environment",
        type: "success"
      });

      handlePopUpClose("restoreEnv");
    } finally {
      setIsRestoreSubmitting(false);
    }
  };

  const onEnvHardDeleteSubmit = async () => {
    if (!currentProject?.id || !hardDeleteEnvData?.id || isDeletePending) return;

    setIsDeleteSubmitting(true);

    try {
      await deleteWsEnvironment.mutateAsync({
        projectId: currentProject.id,
        id: hardDeleteEnvData.id,
        hardDelete: true
      });

      createNotification({
        text: "Successfully deleted environment",
        type: "success"
      });

      handlePopUpClose("hardDeleteEnv");
    } finally {
      setIsDeleteSubmitting(false);
    }
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
                size="sm"
                onClick={() => {
                  if (isExternalMutationPending || isTableMutationPending) return;
                  if (isMoreEnvironmentsAllowed) {
                    handlePopUpOpen("createEnv");
                  } else {
                    handlePopUpOpen("upgradePlan");
                  }
                }}
                isDisabled={!isAllowed || isExternalMutationPending || isTableMutationPending}
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
          <EnvironmentTable
            handlePopUpOpen={handlePopUpOpen}
            isExternalMutationPending={isExternalMutationPending}
            onMutationPendingChange={setIsTableMutationPending}
          />
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
          if (!isOpen && isDeletePending) return;
          handlePopUpToggle("deleteEnv", isOpen);
        }}
      >
        <AlertDialogContent className="sm:max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Schedule deletion of {deleteEnvData?.name ?? "environment"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The {deleteEnvData?.slug ?? ""} environment will be inaccessible immediately, then
              permanently deleted on{" "}
              <span className="font-medium text-foreground">
                {format(addDays(new Date(), 14), "MMM d, yyyy")}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc pl-4 text-sm text-label">
            <li>Restore anytime within 14 days. Secrets, folders, and history are preserved.</li>
            <li>After 14 days, all secret data is wiped and cannot be recovered.</li>
          </ul>
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              Service tokens and integrations referencing {deleteEnvData?.slug ?? ""} will fail to
              resolve. Fix or remove them before the grace period ends.
            </AlertDescription>
          </Alert>
          <AlertDialogFooter className="sm:justify-between">
            <Button
              variant="danger"
              size="sm"
              onClick={onSwitchToHardDelete}
              isDisabled={isDeletePending}
            >
              Delete Now
            </Button>
            <div className="flex gap-2">
              <AlertDialogCancel isDisabled={isDeletePending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="project"
                onClick={(event) => {
                  event.preventDefault();
                  onEnvDeleteSubmit().catch(() => undefined);
                }}
                isPending={isDeletePending}
              >
                Confirm
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={popUp.restoreEnv.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && isRestorePending) return;
          handlePopUpToggle("restoreEnv", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {restoreEnvData?.name ?? "environment"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The {restoreEnvData?.slug ?? ""} environment will become accessible again with its
              secrets, folders, and history preserved. Service tokens and integrations referencing
              it will begin resolving again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRestorePending}>Cancel</AlertDialogCancel>
            <Button
              variant="project"
              size="sm"
              onClick={() => onEnvRestoreSubmit().catch(() => undefined)}
              isPending={isRestorePending}
            >
              Restore Environment
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={popUp.hardDeleteEnv.isOpen}
        confirmationValue={hardDeleteEnvData?.slug}
        onOpenChange={(isOpen) => {
          if (!isOpen && isDeletePending) return;
          handlePopUpToggle("hardDeleteEnv", isOpen);
        }}
      >
        <AlertDialogContent className="sm:max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {hardDeleteEnvData?.name ?? "environment"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bypass the grace period and wipe {hardDeleteEnvData?.slug ?? ""} immediately. All
              secrets, folders, and history will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert variant="danger">
            <TriangleAlertIcon />
            <AlertDescription>
              All secrets and folders will be wiped from storage. Any service token or integration
              referencing {hardDeleteEnvData?.slug ?? ""} will fail immediately and cannot be
              restored from this UI.
            </AlertDescription>
          </Alert>
          <AlertDialogConfirmationField
            inputProps={{ disabled: isDeletePending }}
            onConfirm={() => onEnvHardDeleteSubmit().catch(() => undefined)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isDeletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={(event) => {
                event.preventDefault();
                onEnvHardDeleteSubmit().catch(() => undefined);
              }}
              isPending={isDeletePending}
            >
              Delete Now
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

import { useState } from "react";
import { addDays, format } from "date-fns";
import {
  ClockIcon,
  KeyIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon
} from "lucide-react";

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
  Badge,
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
  const [hardDeleteConfirmation, setHardDeleteConfirmation] = useState("");

  const isMoreEnvironmentsAllowed =
    subscription?.environmentLimit && currentProject?.environments
      ? currentProject.environments.length < subscription.environmentLimit
      : true;

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "createEnv",
    "updateEnv",
    "deleteEnv",
    "hardDeleteEnv",
    "upgradePlan"
  ] as const);

  const deleteEnvData = popUp?.deleteEnv?.data as
    | { name: string; slug: string; id: string }
    | undefined;

  const hardDeleteEnvData = popUp?.hardDeleteEnv?.data as
    | { name: string; slug: string; id: string; expireAfter?: string }
    | undefined;

  const onEnvDeleteSubmit = async () => {
    if (!currentProject?.id || !deleteEnvData?.id) return;

    await deleteWsEnvironment.mutateAsync({
      projectId: currentProject.id,
      id: deleteEnvData.id
    });

    createNotification({
      text: "Environment scheduled for deletion",
      type: "success"
    });

    handlePopUpClose("deleteEnv");
  };

  const onSwitchToHardDelete = () => {
    if (!deleteEnvData) return;
    handlePopUpClose("deleteEnv");
    handlePopUpOpen("hardDeleteEnv", deleteEnvData);
  };

  const onEnvHardDeleteSubmit = async () => {
    if (!currentProject?.id || !hardDeleteEnvData?.id) return;

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
    setHardDeleteConfirmation("");
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
        onOpenChange={(isOpen) => handlePopUpToggle("deleteEnv", isOpen)}
      >
        <AlertDialogContent className="sm:max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Schedule deletion of {deleteEnvData?.name ?? "environment"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The <Badge variant="neutral">{deleteEnvData?.slug ?? ""}</Badge> environment will be
              inaccessible immediately, then permanently deleted on{" "}
              <span className="font-medium text-foreground">
                {format(addDays(new Date(), 14), "MMM d, yyyy")}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-md border border-border bg-foreground/5 p-3 text-sm">
            <div className="flex gap-2">
              <RotateCcwIcon className="mt-0.5 size-4 shrink-0 text-muted" />
              <p>
                <span className="font-medium text-foreground">Restore anytime within 14 days</span>{" "}
                <span className="opacity-80">secrets, folders, and history are preserved.</span>
              </p>
            </div>
            <div className="flex gap-2 opacity-80">
              <KeyIcon className="mt-0.5 size-4 shrink-0 text-muted" />
              <p>
                Service tokens and integrations referencing{" "}
                <Badge variant="neutral">{deleteEnvData?.slug ?? ""}</Badge> will fail to resolve.
                Fix or remove them before the grace period ends.
              </p>
            </div>
            <div className="flex gap-2 opacity-80">
              <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted" />
              <p>After 14 days, all secret data is wiped and cannot be recovered.</p>
            </div>
          </div>
          <AlertDialogFooter className="sm:justify-between">
            <Button
              variant="danger"
              size="sm"
              className="text-danger"
              onClick={onSwitchToHardDelete}
            >
              <Trash2Icon className="size-4" />
              Delete permanently
            </Button>
            <div className="flex gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="project" onClick={onEnvDeleteSubmit}>
                Confirm
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={popUp.hardDeleteEnv.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("hardDeleteEnv", isOpen);
          if (!isOpen) setHardDeleteConfirmation("");
        }}
      >
        <AlertDialogContent className="sm:max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {hardDeleteEnvData?.name ?? "environment"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bypass the grace period and wipe{" "}
              <Badge variant="neutral">{hardDeleteEnvData?.slug ?? ""}</Badge> immediately. All
              secrets, folders, and history will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
            <div className="flex gap-2">
              <Trash2Icon className="mt-0.5 size-4 shrink-0 text-danger" />
              <p>
                <span className="font-medium text-foreground">All secrets and folders</span>{" "}
                <span className="opacity-80">will be wiped from storage and audit reads.</span>
              </p>
            </div>
            <div className="flex gap-2">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
              <span className="opacity-80">
                Any service token or integration referencing {hardDeleteEnvData?.slug ?? ""} will
                fail immediately and cannot be restored from this UI.
              </span>
            </div>
          </div>
          <div className="w-full pt-2 pb-4">
            <p className="mb-2 text-sm text-muted">
              Type <Badge variant="neutral">{hardDeleteEnvData?.slug ?? ""}</Badge> to confirm.
            </p>
            <Input
              value={hardDeleteConfirmation}
              onChange={(e) => setHardDeleteConfirmation(e.target.value)}
              placeholder={hardDeleteEnvData?.slug ?? ""}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="danger"
              size="sm"
              className="text-danger"
              onClick={onEnvHardDeleteSubmit}
              isDisabled={
                !hardDeleteEnvData?.slug || hardDeleteConfirmation !== hardDeleteEnvData.slug
              }
            >
              <Trash2Icon className="size-4" />
              Delete permanently
            </Button>
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

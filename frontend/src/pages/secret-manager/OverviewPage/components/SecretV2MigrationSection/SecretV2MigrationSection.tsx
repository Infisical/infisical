import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  AccessRestrictedDialog,
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Spinner
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { projectKeys, useGetWorkspaceById, useMigrateProjectToV3 } from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

enum ProjectUpgradeStatus {
  InProgress = "IN_PROGRESS",
  // Completed -> Will be null if completed. So a completed status is not needed
  Failed = "FAILED"
}

const formSchema = z.object({
  isCLIChecked: z.literal(true),
  isOperatorChecked: z.literal(true),
  shouldCloseOpenApprovals: z.literal(true)
});

export const SecretV2MigrationSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["migrationInfo"] as const);
  const { currentProject } = useProject();
  const queryClient = useQueryClient();
  const { data: workspaceDetails, refetch } = useGetWorkspaceById(
    // if v3 no need to fetch
    currentProject?.version === ProjectVersion.V3 ? "" : currentProject?.id || "",
    {
      refetchInterval:
        currentProject?.upgradeStatus === ProjectUpgradeStatus.InProgress ? 2000 : false
    }
  );
  const { hasProjectRole } = useProjectPermission();
  const migrateProjectToV3 = useMigrateProjectToV3();
  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting }
  } = useForm({ resolver: zodResolver(formSchema) });
  useEffect(() => {
    if (!popUp.migrationInfo.isOpen) {
      reset();
    }
  }, [popUp.migrationInfo.isOpen]);

  const isProjectUpgraded = workspaceDetails?.version === ProjectVersion.V3;

  useEffect(() => {
    if (isProjectUpgraded && migrateProjectToV3.data) {
      createNotification({ type: "success", text: "Project upgrade completed successfully" });
      migrateProjectToV3.reset();
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
      });
    }
  }, [isProjectUpgraded, Boolean(migrateProjectToV3.data)]);

  if (isProjectUpgraded || currentProject?.version === ProjectVersion.V3) return null;

  const isUpgrading = workspaceDetails?.upgradeStatus === ProjectUpgradeStatus.InProgress;
  const didProjectUpgradeFailed = workspaceDetails?.upgradeStatus === ProjectUpgradeStatus.Failed;

  const handleMigrationSecretV2 = async () => {
    handlePopUpToggle("migrationInfo");
    await migrateProjectToV3.mutateAsync({ projectId: currentProject?.id || "" });
    refetch();
    createNotification({
      text: "Project upgrade started",
      type: "success"
    });
  };

  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  return (
    <div className="flex w-full flex-col gap-3">
      {isUpgrading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-page/80">
          <Spinner size="lg" label="Upgrading secrets engine" />
          <div className="ml-4 flex flex-col gap-1 text-foreground">
            <div className="text-3xl font-medium">Please wait</div>
            <span>Upgrading secrets engine...</span>
          </div>
        </div>
      )}
      <AccessRestrictedDialog
        title="Upgrade your secrets engine to view your project dashboard."
        subtitle={null}
        description={
          <>
            <p>
              Your existing secret-fetching workflows will continue to work. To view secrets in the
              UI, upgrade your project’s secrets engine.
            </p>
            <p>
              The upgrade takes 1–2 minutes with no downtime and delivers up to 10× faster
              performance plus support for your own KMS provider.
            </p>
          </>
        }
        badgeIcon={<TriangleAlertIcon />}
        badgeLabel="Upgrade Required"
        docsUrl={null}
        showGoBack={false}
        action={
          <Button
            variant="project"
            onClick={() => handlePopUpOpen("migrationInfo")}
            isDisabled={!isAdmin || isUpgrading}
            isPending={migrateProjectToV3.isPending}
            isFullWidth
          >
            {isAdmin ? "Upgrade Secrets Engine" : "Upgrade requires admin privilege"}
          </Button>
        }
      />
      {didProjectUpgradeFailed && (
        <Alert variant="danger">
          <CircleXIcon />
          <AlertDescription>
            Secrets engine upgrade unsuccessful. For assistance, please contact the Infisical
            support team.
          </AlertDescription>
        </Alert>
      )}
      <Dialog
        open={popUp.migrationInfo.isOpen}
        onOpenChange={(open) => handlePopUpToggle("migrationInfo", open)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Upgrade Checklist</DialogTitle>
            <DialogDescription>
              To ensure smooth transition, please ensure the following requirements are met before
              upgrading this project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleMigrationSecretV2)} className="flex flex-col gap-6">
            <FieldSet>
              <FieldLegend className="sr-only">Upgrade requirements</FieldLegend>
              <FieldGroup>
                <Controller
                  control={control}
                  name="isCLIChecked"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Field orientation="horizontal" data-invalid={Boolean(error)}>
                      <Checkbox
                        id="is-cli-checked"
                        variant="project"
                        isChecked={value}
                        onCheckedChange={(checked) => onChange(checked === true)}
                        onBlur={onBlur}
                        isError={Boolean(error)}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor="is-cli-checked" className="cursor-pointer" size="sm">
                          Infisical CLI version is v0.25.0 or above.
                        </FieldLabel>
                        <FieldError>
                          {error && "Confirm this requirement before upgrading."}
                        </FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="isOperatorChecked"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Field orientation="horizontal" data-invalid={Boolean(error)}>
                      <Checkbox
                        id="is-operator-checked"
                        variant="project"
                        isChecked={value}
                        onCheckedChange={(checked) => onChange(checked === true)}
                        onBlur={onBlur}
                        isError={Boolean(error)}
                      />
                      <FieldContent>
                        <FieldLabel
                          htmlFor="is-operator-checked"
                          className="cursor-pointer"
                          size="sm"
                        >
                          Infisical Kubernetes Operator version is v0.7.0 or above.
                        </FieldLabel>
                        <FieldError>
                          {error && "Confirm this requirement before upgrading."}
                        </FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="shouldCloseOpenApprovals"
                  defaultValue={false}
                  render={({ field: { onBlur, value, onChange }, fieldState: { error } }) => (
                    <Field orientation="horizontal" data-invalid={Boolean(error)}>
                      <Checkbox
                        id="is-approvals-checked"
                        variant="project"
                        isChecked={value}
                        onCheckedChange={(checked) => onChange(checked === true)}
                        onBlur={onBlur}
                        isError={Boolean(error)}
                      />
                      <FieldContent>
                        <FieldLabel
                          htmlFor="is-approvals-checked"
                          className="cursor-pointer"
                          size="sm"
                        >
                          Close/merge all open approval/access requests.
                        </FieldLabel>
                        <FieldError>
                          {error && "Confirm this requirement before upgrading."}
                        </FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
              </FieldGroup>
            </FieldSet>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handlePopUpToggle("migrationInfo")}
              >
                Cancel
              </Button>
              <Button type="submit" variant="project" isPending={isSubmitting}>
                Confirm Upgrade
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

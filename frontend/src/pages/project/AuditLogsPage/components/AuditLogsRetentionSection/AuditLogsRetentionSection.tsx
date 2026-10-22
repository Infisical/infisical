import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { AuditRetentionUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import {
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getProjectTitle, isOrgScopedProduct } from "@app/helpers/project";
import { usePopUp, useScopeVariant } from "@app/hooks";
import { useUpdateWorkspaceAuditLogsRetention } from "@app/hooks/api/projects/queries";

const formSchema = z.object({
  auditLogsRetentionDays: z.coerce.number().int().min(0).max(36_500)
});

type TForm = z.infer<typeof formSchema>;

export const AuditLogsRetentionSection = () => {
  const scopeVariant = useScopeVariant();
  const { mutateAsync: updateAuditLogsRetention } = useUpdateWorkspaceAuditLogsRetention();

  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const {
    control,
    formState: { isSubmitting, isDirty },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      auditLogsRetentionDays:
        currentProject?.auditLogsRetentionDays ?? subscription?.auditLogsRetentionDays ?? 0
    }
  });

  if (!currentProject) return null;

  // A project value of 0 falls back to the plan, so under a plan with no limit it reads as unlimited.
  const isPlanRetentionUnlimited = subscription?.auditLogsRetentionDays === null;

  const handleAuditLogsRetentionSubmit = async ({ auditLogsRetentionDays }: TForm) => {
    if (!subscription?.auditLogs) {
      handlePopUpOpen("upgradePlan", {
        text: "Configuring audit logs retention can be unlocked if you upgrade to Infisical Pro plan."
      });

      return;
    }

    if (
      subscription?.auditLogsRetentionDays != null &&
      auditLogsRetentionDays > subscription.auditLogsRetentionDays
    ) {
      handlePopUpOpen("upgradePlan", {
        text: "Updating audit logs retention period to a higher value can be unlocked if you upgrade to Infisical Pro plan."
      });

      return;
    }

    await updateAuditLogsRetention({
      auditLogsRetentionDays,
      projectId: currentProject.id
    });

    createNotification({
      text: "Successfully updated audit logs retention period",
      type: "success"
    });
  };

  // Retention is only configurable on dedicated and self-hosted instances.
  if (isInfisicalCloud()) return null;

  const canEdit = permission.can(
    ProjectPermissionAuditLogsActions.Edit,
    ProjectPermissionSub.AuditLogs
  );
  return (
    <>
      <form onSubmit={handleSubmit(handleAuditLogsRetentionSubmit)} autoComplete="off">
        <Card>
          <CardHeader>
            <CardTitle>Audit Logs Retention</CardTitle>
            <CardDescription>
              {isOrgScopedProduct(currentProject.type)
                ? `Set the number of days to keep your ${getProjectTitle(currentProject.type)} audit logs.`
                : "Set the number of days to keep your project audit logs."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              defaultValue={0}
              name="auditLogsRetentionDays"
              render={({ field, fieldState: { error } }) => (
                <Field className="max-w-xs" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="audit-logs-retention-days">Number of days</FieldLabel>
                  <Input
                    id="audit-logs-retention-days"
                    {...field}
                    value={isPlanRetentionUnlimited && !field.value ? "" : field.value}
                    placeholder={isPlanRetentionUnlimited ? "Unlimited" : undefined}
                    type="number"
                    min={1}
                    step={1}
                    disabled={!canEdit}
                    isError={Boolean(error)}
                  />
                  {isPlanRetentionUnlimited && (
                    <FieldDescription>
                      Leave empty to use your plan&apos;s retention, which has no limit.
                    </FieldDescription>
                  )}
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              variant={scopeVariant}
              size="sm"
              type="submit"
              isPending={isSubmitting}
              isDisabled={!canEdit || !isDirty}
            >
              Save Changes
            </Button>
          </CardFooter>
        </Card>
      </form>
      <UpgradeGate
        paywallKey="project.audit-logs-retention"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={{
          ...AuditRetentionUpgradeIntent,
          isEnterpriseFeature: false
        }}
      />
    </>
  );
};

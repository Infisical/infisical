import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useProject, useProjectPermission, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useUpdateWorkspaceAuditLogsRetention } from "@app/hooks/api/projects/queries";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const formSchema = z.object({
  auditLogsRetentionDays: z.coerce.number().min(0)
});

type TForm = z.infer<typeof formSchema>;

export const AuditLogsRetentionSection = () => {
  const { mutateAsync: updateAuditLogsRetention } = useUpdateWorkspaceAuditLogsRetention();

  const { currentProject } = useProject();
  const { hasProjectRole } = useProjectPermission();
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

  const handleAuditLogsRetentionSubmit = async ({ auditLogsRetentionDays }: TForm) => {
    if (!subscription?.auditLogs) {
      handlePopUpOpen("upgradePlan", {
        text: "Configuring audit logs retention can be unlocked if you upgrade to Infisical Pro plan."
      });

      return;
    }

    if (subscription && auditLogsRetentionDays > subscription?.auditLogsRetentionDays) {
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

  // render only for dedicated/self-hosted instances of Infisical
  if (
    window.location.origin.includes("https://app.infisical.com") ||
    window.location.origin.includes("https://gamma.infisical.com")
  ) {
    return null;
  }

  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  return (
    <>
      <form
        onSubmit={handleSubmit(handleAuditLogsRetentionSubmit)}
        autoComplete="off"
        className="mb-6"
      >
        <Card className="gap-0 overflow-hidden p-0">
          <CardHeader className="p-6">
            <CardTitle className="font-alliance">Audit Logs Retention</CardTitle>
            <CardDescription>
              Set the number of days to keep your project audit logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-xs px-6 pb-6">
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
                    type="number"
                    min={1}
                    step={1}
                    disabled={!isAdmin}
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
            <Button
              variant="project"
              size="sm"
              type="submit"
              isPending={isSubmitting}
              isDisabled={!isAdmin || !isDirty}
            >
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </form>
      <UpgradePlanModal
        paywallKey="project.audit-logs-retention"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan?.data?.text}
      />
    </>
  );
};

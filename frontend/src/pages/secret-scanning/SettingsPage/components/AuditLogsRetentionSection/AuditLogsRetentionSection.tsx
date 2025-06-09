import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useProjectPermission, useSubscription, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { useUpdateWorkspaceAuditLogsRetention } from "@app/hooks/api/workspace/queries";

const formSchema = z.object({
  auditLogsRetentionDays: z.coerce.number().min(0)
});

type TForm = z.infer<typeof formSchema>;

export const AuditLogsRetentionSection = () => {
  const { mutateAsync: updateAuditLogsRetention } = useUpdateWorkspaceAuditLogsRetention();

  const { currentWorkspace } = useWorkspace();
  const { membership } = useProjectPermission();
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
        currentWorkspace?.auditLogsRetentionDays ?? subscription?.auditLogsRetentionDays ?? 0
    }
  });

  if (!currentWorkspace) return null;

  const handleAuditLogsRetentionSubmit = async ({ auditLogsRetentionDays }: TForm) => {
    try {
      if (!subscription?.auditLogs) {
        handlePopUpOpen("upgradePlan", {
          description: "You can only configure audit logs retention if you upgrade your plan."
        });

        return;
      }

      if (subscription && auditLogsRetentionDays > subscription?.auditLogsRetentionDays) {
        handlePopUpOpen("upgradePlan", {
          description:
            "To update your audit logs retention period to a higher value, upgrade your plan."
        });

        return;
      }

      await updateAuditLogsRetention({
        auditLogsRetentionDays,
        projectSlug: currentWorkspace.slug
      });

      createNotification({
        text: "Successfully updated audit logs retention period",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed updating audit logs retention period",
        type: "error"
      });
    }
  };

  // render only for dedicated/self-hosted instances of Infisical
  if (
    window.location.origin.includes("https://app.infisical.com") ||
    window.location.origin.includes("https://gamma.infisical.com")
  ) {
    return null;
  }

  const isAdmin = membership.roles.includes(ProjectMembershipRole.Admin);
  return (
    <>
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex w-full items-center justify-between">
          <p className="text-xl font-semibold">Audit Logs Retention</p>
        </div>
        <p className="mb-4 mt-2 max-w-2xl text-sm text-gray-400">
          Set the number of days to keep your project audit logs.
        </p>
        <form onSubmit={handleSubmit(handleAuditLogsRetentionSubmit)} autoComplete="off">
          <div className="max-w-xs">
            <Controller
              control={control}
              defaultValue={0}
              name="auditLogsRetentionDays"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error)}
                  errorText={error?.message}
                  label="Number of days"
                >
                  <Input {...field} type="number" min={1} step={1} isDisabled={!isAdmin} />
                </FormControl>
              )}
            />
          </div>
          <Button
            colorSchema="secondary"
            type="submit"
            isLoading={isSubmitting}
            disabled={!isAdmin || !isDirty}
          >
            Save
          </Button>
        </form>
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
    </>
  );
};

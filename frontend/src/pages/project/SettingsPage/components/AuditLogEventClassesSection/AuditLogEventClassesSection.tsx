import { Controller, useForm } from "react-hook-form";
import { Link } from "@tanstack/react-router";

import { AuditLogEventClassRow } from "@app/components/auditLogSettings";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Skeleton
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { useGetProjectAuditLogSettings, useUpdateProjectAuditLogSettings } from "@app/hooks/api";
import {
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES
} from "@app/hooks/api/auditLogSettings/constants";
import {
  AuditLogEventClass,
  TProjectAuditLogEventClassSetting
} from "@app/hooks/api/auditLogSettings/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

type TForm = Record<AuditLogEventClass, boolean>;

const REQUIRES_NEW_PRIVILEGE_SYSTEM = "Requires the new privilege system";

export const AuditLogEventClassesSection = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data: settings, isPending } = useGetProjectAuditLogSettings(currentProject.id);
  const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateProjectAuditLogSettings();

  const settingFor = (eventClass: AuditLogEventClass): TProjectAuditLogEventClassSetting =>
    settings?.eventClasses.find((el) => el.eventClass === eventClass) ?? {
      eventClass,
      isEnabled: AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass],
      source: "organization"
    };

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, dirtyFields }
  } = useForm<TForm>({
    values: Object.fromEntries(
      AUDIT_LOG_EVENT_CLASSES.map((eventClass) => [eventClass, settingFor(eventClass).isEnabled])
    ) as TForm
  });

  const shouldUseNewPrivilegeSystem =
    settings?.shouldUseNewPrivilegeSystem ?? currentOrg.shouldUseNewPrivilegeSystem;

  // Only send touched rows, so untouched ones keep following the org.
  const onSubmit = async (form: TForm) => {
    const eventClasses = AUDIT_LOG_EVENT_CLASSES.filter(
      (eventClass) => dirtyFields[eventClass]
    ).map((eventClass) => ({ eventClass, isEnabled: form[eventClass] }));
    if (!eventClasses.length) return;

    await updateSettings({ projectId: currentProject.id, eventClasses });
    createNotification({ text: "Audit log settings saved", type: "success" });
  };

  const applyOrgDefault = async (eventClass: AuditLogEventClass) => {
    await updateSettings({
      projectId: currentProject.id,
      eventClasses: [{ eventClass, isEnabled: null }]
    });
    createNotification({
      text: "Project now follows the organization default for this class",
      type: "success"
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mb-6">
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b p-6">
          <CardTitle className="font-alliance">
            Audit Log Event Classes
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-logs" />
          </CardTitle>
          <CardDescription>
            Choose which classes of events this project records. Rows without an override follow the
            organization setting.
          </CardDescription>
        </CardHeader>
        {isPending ? (
          <div className="space-y-4 p-6">
            {AUDIT_LOG_EVENT_CLASSES.map((eventClass) => (
              <Skeleton key={eventClass} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {AUDIT_LOG_EVENT_CLASSES.map((eventClass) => {
              const isAuthorization = eventClass === AuditLogEventClass.Authorization;
              const isLocked = isAuthorization && !shouldUseNewPrivilegeSystem;
              const hasOverride = settingFor(eventClass).source === "project";
              return (
                <Controller
                  key={eventClass}
                  control={control}
                  name={eventClass}
                  render={({ field }) => (
                    <AuditLogEventClassRow
                      eventClass={eventClass}
                      isEnabled={isLocked ? false : field.value}
                      variant="project"
                      isDisabled={!isAdmin}
                      lockedReason={isLocked ? REQUIRES_NEW_PRIVILEGE_SYSTEM : undefined}
                      onCheckedChange={field.onChange}
                      badge={
                        hasOverride ? (
                          <Badge variant="project">Project Override</Badge>
                        ) : (
                          <Badge variant="neutral">Organization Default</Badge>
                        )
                      }
                      action={
                        isAdmin && hasOverride && !isLocked ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="h-auto px-1.5 py-0.5 text-2xs font-normal text-muted hover:text-foreground"
                            isDisabled={isSaving}
                            onClick={() => applyOrgDefault(eventClass)}
                          >
                            Use Organization Default
                          </Button>
                        ) : undefined
                      }
                      warning={
                        eventClass === AuditLogEventClass.DataAccess && !field.value
                          ? "Secret Insights are counted from these events and stay flat while this is off."
                          : undefined
                      }
                      descriptionExtra={
                        isLocked ? (
                          <>
                            Denials are only recorded on the new privilege system.{" "}
                            <Link
                              to="/organizations/$orgId/access-management"
                              params={{ orgId: currentOrg.id }}
                            >
                              Upgrade the privilege system
                            </Link>{" "}
                            in Access Control to enable this class.
                          </>
                        ) : undefined
                      }
                    />
                  )}
                />
              );
            })}
          </div>
        )}
        {isAdmin && (
          <CardFooter className="min-h-8 justify-end gap-2 border-t border-neutral/15 bg-neutral/5 p-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              isDisabled={!isDirty || isSaving}
              onClick={() => reset()}
            >
              Reset
            </Button>
            <Button
              type="submit"
              variant="project"
              size="sm"
              isDisabled={!isDirty}
              isPending={isSaving}
            >
              Save Changes
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
};

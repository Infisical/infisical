import { Controller, useForm } from "react-hook-form";
import { Link } from "@tanstack/react-router";

import { AuditLogEventClassRow } from "@app/components/auditLogSettings";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Skeleton
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { withPermission } from "@app/hoc";
import { useScopeVariant } from "@app/hooks";
import { useGetOrgAuditLogSettings, useUpdateOrgAuditLogSettings } from "@app/hooks/api";
import {
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES
} from "@app/hooks/api/auditLogSettings/constants";
import { AuditLogEventClass } from "@app/hooks/api/auditLogSettings/types";

type TForm = Record<AuditLogEventClass, boolean>;

const REQUIRES_NEW_PRIVILEGE_SYSTEM = "Requires the new privilege system";

export const AuditLogSettingsTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const { permission } = useOrgPermission();
    const scopeVariant = useScopeVariant();
    const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const { data: settings, isPending } = useGetOrgAuditLogSettings(currentOrg.id);
    const { mutateAsync: updateSettings, isPending: isSaving } = useUpdateOrgAuditLogSettings(
      currentOrg.id
    );

    const isEnabled = (eventClass: AuditLogEventClass) =>
      settings?.eventClasses.find((el) => el.eventClass === eventClass)?.isEnabled ??
      AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass];

    const {
      control,
      handleSubmit,
      reset,
      formState: { isDirty }
    } = useForm<TForm>({
      values: Object.fromEntries(
        AUDIT_LOG_EVENT_CLASSES.map((eventClass) => [eventClass, isEnabled(eventClass)])
      ) as TForm
    });

    const shouldUseNewPrivilegeSystem =
      settings?.shouldUseNewPrivilegeSystem ?? currentOrg.shouldUseNewPrivilegeSystem;

    const onSubmit = async (form: TForm) => {
      await updateSettings({
        eventClasses: AUDIT_LOG_EVENT_CLASSES.map((eventClass) => ({
          eventClass,
          isEnabled: form[eventClass]
        }))
      });
      createNotification({ text: "Audit log settings saved", type: "success" });
    };

    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="gap-0 overflow-hidden p-0">
          <CardHeader className="border-b p-6">
            <CardTitle>
              Event Classes
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-logs" />
            </CardTitle>
            <CardDescription>
              Choose which classes of events are recorded. Every event type belongs to exactly one
              class.
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
                return (
                  <Controller
                    key={eventClass}
                    control={control}
                    name={eventClass}
                    render={({ field }) => (
                      <AuditLogEventClassRow
                        eventClass={eventClass}
                        isEnabled={isLocked ? false : field.value}
                        variant={scopeVariant}
                        isDisabled={!canEdit}
                        lockedReason={isLocked ? REQUIRES_NEW_PRIVILEGE_SYSTEM : undefined}
                        onCheckedChange={field.onChange}
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
          {canEdit && (
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
                variant={scopeVariant}
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
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Settings,
    accessRestrictedMode: "dialog"
  }
);

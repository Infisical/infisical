import { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "@tanstack/react-router";

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
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES,
  CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES
} from "@app/hooks/api/auditLogSettings/constants";
import {
  AuditLogEventClass,
  TAuditLogEventClassSetting,
  TAuditLogSettings
} from "@app/hooks/api/auditLogSettings/types";
import { ScopeVariant } from "@app/hooks/useScopeVariant";

import { AuditLogEventClassRow } from "./AuditLogEventClassRow";

type TForm = Record<AuditLogEventClass, boolean>;

const REQUIRES_NEW_PRIVILEGE_SYSTEM = "Requires the new privilege system";
const ALWAYS_RECORDED = "Management events are always recorded";

type Props = {
  title: ReactNode;
  description: string;
  settings?: TAuditLogSettings;
  isPending: boolean;
  isSaving: boolean;
  canEdit: boolean;
  variant: ScopeVariant;
  orgId: string;
  shouldUseNewPrivilegeSystem: boolean;
  onSave: (eventClasses: TAuditLogEventClassSetting[]) => Promise<unknown>;
  className?: string;
  titleClassName?: string;
};

export const AuditLogEventClassesForm = ({
  title,
  description,
  settings,
  isPending,
  isSaving,
  canEdit,
  variant,
  orgId,
  shouldUseNewPrivilegeSystem,
  onSave,
  className,
  titleClassName
}: Props) => {
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

  const onSubmit = async (form: TForm) => {
    const eventClasses = CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES.map((eventClass) => ({
      eventClass,
      isEnabled: form[eventClass]
    }));

    try {
      await onSave(eventClasses);
      createNotification({ text: "Audit log settings saved", type: "success" });
    } catch {
      createNotification({ text: "Failed to save audit log settings", type: "error" });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={className}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b p-6">
          <CardTitle className={titleClassName}>
            {title}
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-logs" />
          </CardTitle>
          <CardDescription>{description}</CardDescription>
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
              const isManagement = eventClass === AuditLogEventClass.Management;
              const isAuthorization = eventClass === AuditLogEventClass.Authorization;
              const isLocked = isAuthorization && !shouldUseNewPrivilegeSystem;
              let lockedReason: string | undefined;
              if (isManagement) lockedReason = ALWAYS_RECORDED;
              else if (isLocked) lockedReason = REQUIRES_NEW_PRIVILEGE_SYSTEM;
              return (
                <Controller
                  key={eventClass}
                  control={control}
                  name={eventClass}
                  render={({ field }) => (
                    <AuditLogEventClassRow
                      eventClass={eventClass}
                      isEnabled={isManagement || (!isLocked && field.value)}
                      variant={variant}
                      isDisabled={!canEdit}
                      lockedReason={lockedReason}
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
                            <Link to="/organizations/$orgId/access-management" params={{ orgId }}>
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
          <CardFooter className="min-h-8 justify-end gap-2 border-t p-4">
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
              variant={variant}
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

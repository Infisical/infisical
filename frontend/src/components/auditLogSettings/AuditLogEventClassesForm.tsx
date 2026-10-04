import { Controller, useForm } from "react-hook-form";
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  FieldGroup,
  Skeleton
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES,
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES,
  auditLogEventClassToNameMap,
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

type Props = {
  title: string;
  description: string;
  settings?: TAuditLogSettings;
  isPending: boolean;
  isError?: boolean;
  isSaving: boolean;
  canEdit: boolean;
  readOnlyMessage: string;
  variant: ScopeVariant;
  paywallKey: string;
  onSave: (eventClasses: TAuditLogEventClassSetting[]) => Promise<unknown>;
};

export const AuditLogEventClassesForm = ({
  title,
  description,
  settings,
  isPending,
  isError,
  isSaving,
  canEdit,
  readOnlyMessage,
  variant,
  paywallKey,
  onSave
}: Props) => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
  const shouldUseNewPrivilegeSystem =
    settings?.shouldUseNewPrivilegeSystem ?? currentOrg.shouldUseNewPrivilegeSystem;

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
    if (subscription && !subscription.auditLogs) {
      handlePopUpOpen("upgradePlan");
      return;
    }
    const eventClasses = CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES.map((eventClass) => ({
      eventClass,
      isEnabled:
        eventClass === AuditLogEventClass.Authorization && !shouldUseNewPrivilegeSystem
          ? false
          : form[eventClass]
    }));

    try {
      await onSave(eventClasses);
      createNotification({ text: "Audit log settings saved", type: "success" });
    } catch {
      // MutationCache reports request errors globally.
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {!canEdit && !isError && !isPending && (
        <Alert variant="info" className="mb-4">
          <Info />
          <AlertDescription>{readOnlyMessage}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {title}
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-logs" />
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {isError && (
            <p className="text-sm text-muted">
              Couldn&apos;t load the audit log settings. Refresh the page to try again.
            </p>
          )}
          {!isError &&
            (isPending ? (
              <FieldGroup>
                {AUDIT_LOG_EVENT_CLASSES.map((eventClass) => (
                  <Skeleton key={eventClass} className="h-12 w-full" />
                ))}
              </FieldGroup>
            ) : (
              <FieldGroup>
                {AUDIT_LOG_EVENT_CLASSES.map((eventClass) => {
                  const isAlwaysRecorded =
                    ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES.includes(eventClass);
                  const isAuthorization = eventClass === AuditLogEventClass.Authorization;
                  const isLocked = isAuthorization && !shouldUseNewPrivilegeSystem;
                  let lockedReason: string | undefined;
                  if (isAlwaysRecorded)
                    lockedReason = `${auditLogEventClassToNameMap[eventClass]} events are always recorded`;
                  else if (isLocked) lockedReason = REQUIRES_NEW_PRIVILEGE_SYSTEM;
                  return (
                    <Controller
                      key={eventClass}
                      control={control}
                      name={eventClass}
                      render={({ field }) => (
                        <AuditLogEventClassRow
                          eventClass={eventClass}
                          isEnabled={isAlwaysRecorded || (!isLocked && field.value)}
                          variant={variant}
                          isDisabled={!canEdit}
                          lockedReason={lockedReason}
                          onCheckedChange={field.onChange}
                          descriptionExtra={
                            isLocked ? (
                              <>
                                Denials are only recorded on the new privilege system.{" "}
                                <Link
                                  to="/organizations/$orgId/access-management"
                                  params={{ orgId: currentOrg.id }}
                                  className="underline underline-offset-2 hover:text-foreground"
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
              </FieldGroup>
            ))}
        </CardContent>
        {canEdit && !isError && (
          <CardFooter className="justify-end gap-2">
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
      <UpgradePlanModal
        paywallKey={paywallKey}
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to audit logs. To change which events are recorded, please upgrade to Infisical Pro plan."
      />
    </form>
  );
};

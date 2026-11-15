import { useMemo } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import { Switch } from "@infisical/cipher/ui/switch";

import {
  ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES,
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES,
  auditLogEventClassToDescriptionMap,
  auditLogEventClassToNameMap,
  CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES
} from "@app/hooks/api/auditLogSettings/constants";
import {
  AuditLogEventClass,
  type TAuditLogEventClassSetting,
  type TAuditLogSettings
} from "@app/hooks/api/auditLogSettings/types";

import { toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref } from "../../links";

export const EventClassesCard = ({
  description,
  settings,
  isPending,
  error,
  locked,
  onSave
}: {
  description: string;
  settings?: TAuditLogSettings;
  isPending: boolean;
  error: unknown;
  locked?: string;
  onSave: (eventClasses: TAuditLogEventClassSetting[]) => Promise<unknown>;
}) => {
  const { organization } = useV4Session();
  const { data: org } = useV4Adapter("org").useOrganization(organization.id);
  const newPrivileges =
    settings?.shouldUseNewPrivilegeSystem ?? org?.shouldUseNewPrivilegeSystem ?? false;
  const storedFlags = CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES.map((eventClass) =>
    eventClass === AuditLogEventClass.Authorization && !newPrivileges
      ? false
      : (settings?.eventClasses.find((entry) => entry.eventClass === eventClass)?.isEnabled ??
        AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass])
  )
    .map(Number)
    .join("");
  const stored = useMemo(
    () =>
      CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES.map((eventClass, index) => ({
        eventClass,
        isEnabled: storedFlags[index] === "1"
      })),
    [storedFlags]
  );
  const { value, save, status, pending } = useAutosave({
    value: stored,
    errorMessage: "Couldn't update the recorded event classes. Try again.",
    onSave: async (eventClasses) => {
      await onSave(eventClasses);
      toast({ tone: "ok", title: "Audit log settings saved" });
    }
  });

  if (error)
    return (
      <SettingsCard title="Event classes">
        <EmptyState
          size="sm"
          media="bare"
          icon="alert"
          title="Couldn't load the audit log settings"
          description="Refresh the page to try again."
        />
      </SettingsCard>
    );

  return (
    <SettingsCard
      title="Event classes"
      description={description}
      loading={isPending}
      locked={locked}
      saveStatus={status}
    >
      <Stack gap={16}>
        {AUDIT_LOG_EVENT_CLASSES.map((eventClass) => {
          const always = ALWAYS_RECORDED_AUDIT_LOG_EVENT_CLASSES.includes(eventClass);
          const needsPrivileges = eventClass === AuditLogEventClass.Authorization && !newPrivileges;
          let text = auditLogEventClassToDescriptionMap[eventClass];
          if (always) text = `${text} Always recorded.`;
          if (needsPrivileges) text = `${text} Only recorded on the new privilege system.`;
          return (
            <Switch
              key={eventClass}
              layout="row"
              label={auditLogEventClassToNameMap[eventClass]}
              description={text}
              checked={
                always ||
                (!needsPrivileges &&
                  Boolean(value.find((entry) => entry.eventClass === eventClass)?.isEnabled))
              }
              disabled={always || needsPrivileges || Boolean(locked) || pending}
              onCheckedChange={(checked) =>
                save(
                  value.map((entry) =>
                    entry.eventClass === eventClass ? { ...entry, isEnabled: checked } : entry
                  )
                )
              }
            />
          );
        })}
        {!newPrivileges && (
          <Button variant="link" underline="hover" asChild>
            <a href={orgHref(organization.id, "/access-management")}>
              Upgrade the privilege system in access control
            </a>
          </Button>
        )}
      </Stack>
    </SettingsCard>
  );
};

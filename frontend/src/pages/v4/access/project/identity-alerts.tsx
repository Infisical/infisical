import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Badge, Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@infisical/cipher/ui/popover";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  ALERT_EVENT_TYPE_DESCRIPTIONS,
  ALERT_RESOURCE_EVENT_TYPES,
  AlertEventType,
  AlertResourceType,
  channelFormSchema,
  MAX_ALERT_BEFORE_DAYS,
  MIN_ALERT_BEFORE_DAYS,
  type TAlert
} from "@app/hooks/api/alerts/types";
import {
  parseAlertBeforeDays,
  toAlertBefore,
  toChannelForm,
  toChannelInput
} from "@app/hooks/api/alerts/utils";

import { ChannelsStep } from "../../cert-manager/SettingsPage/alert-channels";
import {
  MAX_CHANNELS,
  type TDraftChannel,
  type TFieldErrors,
  toDraftChannel,
  toFieldErrors,
  toMemberEmails,
  validateChannels,
  withoutErrors
} from "../../cert-manager/SettingsPage/alert-model";
import { useV4Adapter } from "../../data/adapters";
import { useOrgId, useOrgPermission } from "../permissions";
import { failed, readableFailure, saved } from "../toast";
import { Gate } from "../ui";

const EVENT_TYPES = ALERT_RESOURCE_EVENT_TYPES[AlertResourceType.IdentityAuthentication];

const EVENT_LABELS: Partial<Record<AlertEventType, string>> = {
  [AlertEventType.IdentityAuthenticationExpiry]: "Credential expiration",
  [AlertEventType.IdentityAuthMethodChanged]: "Auth method change"
};

const DEFAULT_NAMES: Partial<Record<AlertEventType, string>> = {
  [AlertEventType.IdentityAuthenticationExpiry]: "Credential expiration alert",
  [AlertEventType.IdentityAuthMethodChanged]: "Auth method change alert"
};

const DEFAULT_ALERT_BEFORE_DAYS = 7;

const eventLabel = (alert: TAlert) =>
  EVENT_LABELS[alert.eventType as AlertEventType] ?? alert.eventType;

const formSchema = z
  .object({
    eventType: z.nativeEnum(AlertEventType),
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().trim().max(1000),
    enabled: z.boolean(),
    alertBeforeDays: z.string(),
    dailyReminder: z.boolean(),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
    if (form.eventType !== AlertEventType.IdentityAuthenticationExpiry) return;
    const days = Number(form.alertBeforeDays);
    let message: string | undefined;
    if (!form.alertBeforeDays.trim() || Number.isNaN(days)) message = "Enter a number";
    else if (!Number.isInteger(days)) message = "Must be a whole number";
    else if (days < MIN_ALERT_BEFORE_DAYS)
      message = `Must be at least ${MIN_ALERT_BEFORE_DAYS} day`;
    else if (days > MAX_ALERT_BEFORE_DAYS)
      message = `Must be at most ${MAX_ALERT_BEFORE_DAYS} days`;
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["alertBeforeDays"], message });
  });
type TDraft = Omit<z.infer<typeof formSchema>, "channels"> & { channels: TDraftChannel[] };

const DETAIL_FIELDS = ["eventType", "name", "description", "alertBeforeDays"];

const useIdentityAlerts = (identityId: string, projectId?: string) =>
  useV4Adapter("certManagerSettings").useAlerts({
    resourceType: AlertResourceType.IdentityAuthentication,
    resourceId: identityId,
    ...(projectId ? { projectId } : {})
  });

const AlertSheet = ({
  identityId,
  projectId,
  alert,
  used,
  onOpenChange
}: {
  identityId: string;
  projectId: string;
  alert?: TAlert;
  used: AlertEventType[];
  onOpenChange: (open: boolean) => void;
}) => {
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const settings = useV4Adapter("certManagerSettings");
  const createAlert = settings.useCreateAlert();
  const updateAlert = settings.useUpdateAlert();
  const canReadMembers = permission.can(
    OrgPermissionMemberActions.Read,
    OrgPermissionSubjects.Member
  );
  const orgUsers = settings.useAlertOrgUsers(orgId, { enabled: canReadMembers });
  const firstFree = EVENT_TYPES.find((event) => !used.includes(event)) ?? EVENT_TYPES[0];
  const [initial] = useState((): TDraft => ({
    eventType: (alert?.eventType as AlertEventType) ?? firstFree,
    name: alert?.name ?? DEFAULT_NAMES[firstFree] ?? "",
    description: alert?.description ?? "",
    enabled: alert?.enabled ?? true,
    alertBeforeDays: String(
      parseAlertBeforeDays(alert?.condition?.alertBefore) ?? DEFAULT_ALERT_BEFORE_DAYS
    ),
    dailyReminder: alert?.condition?.dailyReminder ?? false,
    channels: (alert?.channels ?? []).map((channel) => toDraftChannel(toChannelForm(channel)))
  }));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<TFieldErrors>({});
  const [channelErrors, setChannelErrors] = useState<TFieldErrors>({});
  const completed = useRef(false);
  const guard = useDiscardChangesGuard({
    isDirty: JSON.stringify(draft) !== JSON.stringify(initial),
    onDiscard: () => onOpenChange(false)
  });
  const isExpiry = draft.eventType === AlertEventType.IdentityAuthenticationExpiry;

  const update = (patch: Partial<TDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors((current) =>
      Object.keys(patch).reduce((next, key) => withoutErrors(next, key), current)
    );
  };

  const onComplete = async () => {
    const parsed = formSchema.safeParse(draft);
    if (!parsed.success) throw new Error("Fix the highlighted fields, then try again.");
    const { data } = parsed;
    const condition = isExpiry
      ? {
          alertBefore: toAlertBefore(Number(data.alertBeforeDays)),
          dailyReminder: data.dailyReminder
        }
      : null;
    const channels = data.channels.map(toChannelInput);
    if (alert) {
      await updateAlert
        .mutateAsync({
          alertId: alert.id,
          name: data.name,
          description: data.description || null,
          enabled: data.enabled,
          condition,
          channels
        })
        .catch(readableFailure("Could not update the alert."));
      saved(`Alert "${data.name}" updated`);
    } else {
      await createAlert
        .mutateAsync({
          name: data.name,
          description: data.description || undefined,
          resourceType: AlertResourceType.IdentityAuthentication,
          resourceId: identityId,
          eventType: data.eventType,
          condition,
          enabled: data.enabled,
          projectId,
          channels
        })
        .catch(readableFailure("Could not create the alert."));
      saved(`Alert "${data.name}" created`);
    }
    completed.current = true;
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        open
        onOpenChange={(next) => {
          if (next || completed.current) {
            onOpenChange(next);
            return;
          }
          guard.requestDiscard();
        }}
        title={alert ? "Edit alert" : "Create alert"}
        completeLabel={alert ? "Save alert" : "Create alert"}
        onComplete={onComplete}
        steps={[
          {
            title: "Details",
            summary: EVENT_LABELS[draft.eventType],
            validate: () => {
              const result = formSchema.safeParse(draft);
              const next = toFieldErrors(result.success ? undefined : result.error, ([key]) =>
                DETAIL_FIELDS.includes(String(key))
              );
              setErrors(next);
              return Object.keys(next).length === 0;
            },
            content: (
              <Stack gap={16}>
                <Field
                  wide
                  label="Event"
                  description={ALERT_EVENT_TYPE_DESCRIPTIONS[draft.eventType]}
                >
                  <Select
                    label="Event"
                    value={draft.eventType}
                    disabled={Boolean(alert)}
                    options={EVENT_TYPES.map((event) => ({
                      value: event,
                      label: EVENT_LABELS[event] ?? event,
                      disabled: used.includes(event)
                    }))}
                    onChange={(value) => {
                      const next = value as AlertEventType;
                      update({
                        eventType: next,
                        ...(draft.name === DEFAULT_NAMES[draft.eventType] && {
                          name: DEFAULT_NAMES[next] ?? ""
                        })
                      });
                    }}
                  />
                </Field>
                <Field wide label="Name" error={errors.name}>
                  <Input
                    value={draft.name}
                    invalid={Boolean(errors.name)}
                    autoComplete="off"
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </Field>
                <Field wide label="Description" optional error={errors.description}>
                  <Textarea
                    rows={3}
                    value={draft.description}
                    aria-invalid={Boolean(errors.description) || undefined}
                    onChange={(event) => update({ description: event.target.value })}
                  />
                </Field>
                {isExpiry && (
                  <Stack gap={8}>
                    <Field label="Days before expiry" error={errors.alertBeforeDays}>
                      <Input
                        type="number"
                        width="xs"
                        min={MIN_ALERT_BEFORE_DAYS}
                        max={MAX_ALERT_BEFORE_DAYS}
                        value={draft.alertBeforeDays}
                        invalid={Boolean(errors.alertBeforeDays)}
                        onChange={(event) => update({ alertBeforeDays: event.target.value })}
                      />
                    </Field>
                    <Checkbox
                      label="Repeat daily until the credential is rotated"
                      checked={draft.dailyReminder}
                      onChange={(dailyReminder) => update({ dailyReminder })}
                    />
                  </Stack>
                )}
                <Switch
                  layout="row"
                  label="Enabled"
                  checked={draft.enabled}
                  onCheckedChange={(enabled) => update({ enabled })}
                />
              </Stack>
            )
          },
          {
            title: "Channels",
            heading: "Notification channels",
            validate: () => {
              if (!draft.channels.length) return { message: "Add at least one channel." };
              const next = validateChannels(draft.channels);
              setChannelErrors(next);
              return Object.keys(next).length === 0;
            },
            content: (
              <ChannelsStep
                channels={draft.channels}
                errors={channelErrors}
                onChange={(channels) => setDraft((current) => ({ ...current, channels }))}
                onErrorsChange={setChannelErrors}
                projectId={projectId}
                alertId={alert?.id}
                members={toMemberEmails(orgUsers.data)}
                hasEnterprise
                resource={{
                  resourceType: AlertResourceType.IdentityAuthentication,
                  resourceId: identityId
                }}
              />
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved changes to this alert will be lost."
      />
    </>
  );
};

const channelSummary = (alert: TAlert) =>
  [
    ...new Set(
      alert.channels.filter(({ enabled }) => enabled).map(({ channelType }) => channelType)
    )
  ]
    .map((type) => ALERT_CHANNEL_TYPE_LABELS[type])
    .join(", ");

const AlertRow = ({
  alert,
  editable,
  canEdit,
  onEdit,
  onRemove
}: {
  alert: TAlert;
  editable: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const updateAlert = useV4Adapter("certManagerSettings").useUpdateAlert();
  return (
    <Inline gap={12} justify="between" wrap={false}>
      <Stack gap={2} style={{ minWidth: 0 }}>
        <SmallText truncate>{alert.name}</SmallText>
        <SmallText muted truncate>
          {channelSummary(alert)
            ? `${eventLabel(alert)} via ${channelSummary(alert)}`
            : eventLabel(alert)}
        </SmallText>
      </Stack>
      {editable ? (
        <Inline gap={4} wrap={false}>
          <Switch
            size="sm"
            aria-label={`${alert.enabled ? "Disable" : "Enable"} ${alert.name}`}
            checked={alert.enabled}
            disabledReason={canEdit ? undefined : "Access restricted"}
            onCheckedChange={(enabled) =>
              updateAlert
                .mutateAsync({ alertId: alert.id, enabled })
                .then(() => saved(`Alert ${enabled ? "enabled" : "disabled"}`))
                .catch((error) => failed("Failed to update the alert", error))
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                icon="more"
                iconOnly
                disabledReason={canEdit ? undefined : "Access restricted"}
              >
                {`Options for ${alert.name}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Icon name="settings" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                <Icon name="trash" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Inline>
      ) : (
        <Badge tone={alert.enabled ? "ok" : "outline"}>
          {alert.enabled ? "Active" : "Disabled"}
        </Badge>
      )}
    </Inline>
  );
};

type AlertActionProps = {
  identityId: string;
  projectId?: string;
  canEdit: boolean;
  readOnly?: boolean;
};

const IdentityAlertMenu = ({
  identityId,
  projectId,
  canEdit,
  readOnly = false,
  alerts
}: AlertActionProps & { alerts: TAlert[] }) => {
  const settings = useV4Adapter("certManagerSettings");
  const deleteAlert = settings.useDeleteAlert();
  const [listOpen, setListOpen] = useState(false);
  const [editing, setEditing] = useState<{ alert?: TAlert }>();
  const [deleting, setDeleting] = useState<TAlert>();
  const used = alerts.map(({ eventType }) => eventType as AlertEventType);
  const enabledCount = alerts.filter(({ enabled }) => enabled).length;
  const canAdd = EVENT_TYPES.some((event) => !used.includes(event));
  const editable = !readOnly && Boolean(projectId);

  const open = (alert?: TAlert) => {
    setListOpen(false);
    setEditing({ alert });
  };

  return (
    <>
      {alerts.length ? (
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" icon="bell">
              Alerts
              <Count
                tone={enabledCount ? "accent" : "neutral"}
                aria-label={`${enabledCount} enabled`}
              >
                {enabledCount}
              </Count>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" style={{ width: 384 }}>
            <PopoverHeader>
              <Inline gap={8} justify="between">
                <PopoverTitle>Alerts</PopoverTitle>
                <SmallText muted>{`${enabledCount} of ${alerts.length} enabled`}</SmallText>
              </Inline>
            </PopoverHeader>
            <Stack gap={12}>
              {alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  editable={editable}
                  canEdit={canEdit}
                  onEdit={() => open(alert)}
                  onRemove={() => {
                    setListOpen(false);
                    setDeleting(alert);
                  }}
                />
              ))}
              {editable && canAdd && (
                <div>
                  <Gate allowed={canEdit}>
                    <Button
                      variant="outline"
                      size="sm"
                      icon="plus"
                      disabled={!canEdit}
                      onClick={() => open()}
                    >
                      Add alert
                    </Button>
                  </Gate>
                </div>
              )}
            </Stack>
          </PopoverContent>
        </Popover>
      ) : (
        <Gate allowed={canEdit}>
          <Button variant="outline" icon="bell" disabled={!canEdit} onClick={() => open()}>
            Alerts
          </Button>
        </Gate>
      )}
      {editable && editing && projectId && (
        <AlertSheet
          identityId={identityId}
          projectId={projectId}
          alert={editing.alert}
          used={used.filter((event) => event !== editing.alert?.eventType)}
          onOpenChange={(next) => !next && setEditing(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="delete">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${deleting?.name ?? "alert"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The alert stops sending notifications. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteAlert.mutateAsync({ alertId: deleting.id });
                  saved(`Alert "${deleting.name}" removed`);
                  setDeleting(undefined);
                } catch (error) {
                  failed("Failed to remove the alert", error);
                }
              }}
            >
              Remove alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const IdentityAlertAction = (props: AlertActionProps) => {
  const query = useIdentityAlerts(props.identityId, props.projectId);
  if (!query.data)
    return (
      <Button
        variant="outline"
        icon="bell"
        loading={query.isPending}
        disabledReason={
          query.error ? "Couldn't load alerts. Reload the page to try again." : undefined
        }
      >
        Alerts
      </Button>
    );
  if (!query.data.length && props.readOnly) return null;
  return <IdentityAlertMenu {...props} alerts={query.data} />;
};

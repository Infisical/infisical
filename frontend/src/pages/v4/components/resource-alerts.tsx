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
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, InlineItem, Stack } from "@infisical/cipher/ui/layout";
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
  OrgPermissionGroupActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  ALERT_EVENT_TYPE_DESCRIPTIONS,
  ALERT_RESOURCE_EVENT_TYPES,
  ALERT_RESOURCE_TYPES_WITH_EMAIL_ADDRESSES,
  ALERT_RESOURCE_TYPES_WITH_PROJECT_RECIPIENTS,
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
import { SecretScanningScanTrigger } from "@app/hooks/api/secretScanningV2/enums";

import { useOrgId, useOrgPermission, useProjectPermission } from "../access/permissions";
import { failed, readableFailure, saved } from "../access/toast";
import { Gate, RESTRICTED } from "../access/ui";
import { ChannelsStep, type TRecipientGroup } from "../cert-manager/SettingsPage/alert-channels";
import { useAlertMembers } from "../cert-manager/SettingsPage/alert-members";
import {
  MAX_CHANNELS,
  type TDraftChannel,
  type TFieldErrors,
  toDraftChannel,
  toFieldErrors,
  validateChannels,
  withoutErrors
} from "../cert-manager/SettingsPage/alert-model";
import { useV4Adapter } from "../data/adapters";

const EVENT_LABELS: Record<AlertEventType, string> = {
  [AlertEventType.IdentityAuthenticationExpiry]: "Credential expiration",
  [AlertEventType.IdentityAuthMethodChanged]: "Auth method change",
  [AlertEventType.PamAccessRequested]: "Access requested",
  [AlertEventType.PamAccessRequestApproved]: "Request approved",
  [AlertEventType.PamAccessRequestDenied]: "Request denied",
  [AlertEventType.PamAccessRequestBypassed]: "Break-glass used",
  [AlertEventType.AuditLogStreamDeliveryFailed]: "Delivery failure",
  [AlertEventType.SecretRotationFailed]: "Rotation failure",
  [AlertEventType.SecretSyncFailed]: "Sync failure",
  [AlertEventType.HoneyTokenTriggered]: "Honey token triggered",
  [AlertEventType.SecretScanningSecretsDetected]: "Secrets detected",
  [AlertEventType.SecretScanningScanFailed]: "Scan failure",
  [AlertEventType.GatewayOffline]: "Gateway offline"
};

const DEFAULT_NAMES: Record<AlertEventType, string> = {
  [AlertEventType.IdentityAuthenticationExpiry]: "Credential expiration alert",
  [AlertEventType.IdentityAuthMethodChanged]: "Auth method change alert",
  [AlertEventType.PamAccessRequested]: "Access requested alert",
  [AlertEventType.PamAccessRequestApproved]: "Request approved alert",
  [AlertEventType.PamAccessRequestDenied]: "Request denied alert",
  [AlertEventType.PamAccessRequestBypassed]: "Break-glass alert",
  [AlertEventType.AuditLogStreamDeliveryFailed]: "Stream delivery failure alert",
  [AlertEventType.SecretRotationFailed]: "Rotation failure alert",
  [AlertEventType.SecretSyncFailed]: "Sync failure alert",
  [AlertEventType.HoneyTokenTriggered]: "Honey token trigger alert",
  [AlertEventType.SecretScanningSecretsDetected]: "Secrets detected",
  [AlertEventType.SecretScanningScanFailed]: "Secret scanning failed",
  [AlertEventType.GatewayOffline]: "Gateway offline alert"
};

const SCAN_TRIGGER_OPTIONS = [
  { value: SecretScanningScanTrigger.Push, label: "Push" },
  { value: SecretScanningScanTrigger.PullRequest, label: "Pull request" },
  { value: SecretScanningScanTrigger.Manual, label: "Manual scan" },
  { value: SecretScanningScanTrigger.ResourcesAdded, label: "New resource" }
];

const DEFAULT_ALERT_BEFORE_DAYS = 7;
const GROUP_LIMIT = 100;

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
    scanTriggers: z.array(z.nativeEnum(SecretScanningScanTrigger)),
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

type TResourceAlertsProps = {
  resourceType: AlertResourceType;
  resourceId?: string;
  projectId?: string;
  canEdit: boolean;
  readOnly?: boolean;
};

export const useAlertGroups = (projectId?: string): TRecipientGroup[] | undefined => {
  const orgId = useOrgId();
  const access = useV4Adapter("access");
  const { permission } = useOrgPermission();
  const { permission: projectPermission } = useProjectPermission(projectId ?? "");
  const canReadOrgGroups =
    !projectId && permission.can(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);
  const canReadProjectGroups =
    Boolean(projectId) &&
    projectPermission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups);
  const orgGroups = access.useOrgGroups({
    organizationId: canReadOrgGroups ? orgId : "",
    limit: GROUP_LIMIT
  });
  const projectGroups = access.useProjectGroups(projectId ?? "", undefined, {
    enabled: canReadProjectGroups
  });
  if (canReadOrgGroups) return orgGroups.data?.groups;
  if (canReadProjectGroups) return projectGroups.data?.map(({ group }) => group);
  return undefined;
};

const AlertSheet = ({
  resourceType,
  resourceId,
  projectId,
  alert,
  used,
  onOpenChange
}: Omit<TResourceAlertsProps, "canEdit" | "readOnly"> & {
  alert?: TAlert;
  used: Set<string>;
  onOpenChange: (open: boolean) => void;
}) => {
  const settings = useV4Adapter("certManagerSettings");
  const createAlert = settings.useCreateAlert();
  const updateAlert = settings.useUpdateAlert();
  const members = useAlertMembers(projectId);
  const groupOptions = useAlertGroups(projectId);
  const eventTypes = ALERT_RESOURCE_EVENT_TYPES[resourceType];
  const firstFree = eventTypes.find((event) => !used.has(event)) ?? eventTypes[0];
  const [initial] = useState((): TDraft => ({
    eventType: (alert?.eventType as AlertEventType) ?? firstFree,
    name: alert?.name ?? DEFAULT_NAMES[firstFree],
    description: alert?.description ?? "",
    enabled: alert?.enabled ?? true,
    alertBeforeDays: String(
      parseAlertBeforeDays(alert?.condition?.alertBefore) ?? DEFAULT_ALERT_BEFORE_DAYS
    ),
    dailyReminder: alert?.condition?.dailyReminder ?? false,
    scanTriggers: alert?.condition?.scanTriggers ?? [],
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
  const isSecretScanning = resourceType === AlertResourceType.SecretScanning;

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
    let condition: Record<string, unknown> | null = null;
    if (isExpiry)
      condition = {
        alertBefore: toAlertBefore(Number(data.alertBeforeDays)),
        dailyReminder: data.dailyReminder
      };
    else if (isSecretScanning && data.scanTriggers.length)
      condition = { scanTriggers: data.scanTriggers };
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
          resourceType,
          resourceId: resourceId ?? null,
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
        size="lg"
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
                    disabled={Boolean(alert) || eventTypes.length === 1}
                    options={eventTypes.map((event) => ({
                      value: event,
                      label: EVENT_LABELS[event],
                      disabled: used.has(event)
                    }))}
                    onChange={(value) => {
                      const next = value as AlertEventType;
                      update({
                        eventType: next,
                        ...(draft.name === DEFAULT_NAMES[draft.eventType] && {
                          name: DEFAULT_NAMES[next]
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
                {isSecretScanning && (
                  <Field
                    wide
                    label="Scans"
                    optional
                    description="Leave empty to alert on every kind of scan. To stop alerts from pull requests, select every kind except Pull request."
                  >
                    <Combobox
                      multiple
                      label="Scans"
                      options={SCAN_TRIGGER_OPTIONS}
                      value={draft.scanTriggers}
                      placeholder="All scans"
                      onChange={(values) =>
                        update({ scanTriggers: values as SecretScanningScanTrigger[] })
                      }
                    />
                  </Field>
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
                members={members}
                groupOptions={groupOptions}
                allowEmailAddresses={ALERT_RESOURCE_TYPES_WITH_EMAIL_ADDRESSES.includes(
                  resourceType
                )}
                projectRecipients={
                  Boolean(projectId) &&
                  ALERT_RESOURCE_TYPES_WITH_PROJECT_RECIPIENTS.includes(resourceType)
                }
                hasEnterprise
                resource={{ resourceType, resourceId: resourceId ?? alert?.resourceId ?? null }}
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
      alert.channels
        .filter(({ enabled }) => enabled)
        .map(({ channelType }) => ALERT_CHANNEL_TYPE_LABELS[channelType])
    )
  ].join(", ");

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
  const channels = channelSummary(alert);
  return (
    <Inline gap={12} justify="between" wrap={false}>
      <Stack gap={2} style={{ minWidth: 0 }}>
        <SmallText truncate>{alert.name}</SmallText>
        <SmallText muted truncate>
          {channels ? `${eventLabel(alert)} via ${channels}` : eventLabel(alert)}
        </SmallText>
      </Stack>
      <InlineItem shrink={false}>
        {editable ? (
          <Inline gap={4} wrap={false}>
            <Switch
              size="sm"
              aria-label={`${alert.enabled ? "Disable" : "Enable"} ${alert.name}`}
              checked={alert.enabled}
              disabledReason={canEdit ? undefined : RESTRICTED}
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
                  disabledReason={canEdit ? undefined : RESTRICTED}
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
      </InlineItem>
    </Inline>
  );
};

const ResourceAlertMenu = ({
  resourceType,
  resourceId,
  projectId,
  canEdit,
  readOnly = false,
  alerts
}: TResourceAlertsProps & { alerts: TAlert[] }) => {
  const deleteAlert = useV4Adapter("certManagerSettings").useDeleteAlert();
  const [listOpen, setListOpen] = useState(false);
  const [editing, setEditing] = useState<{ alert?: TAlert }>();
  const [deleting, setDeleting] = useState<TAlert>();
  const used = new Set(resourceId ? alerts.map(({ eventType }) => eventType) : []);
  const enabledCount = alerts.filter(({ enabled }) => enabled).length;
  const canAdd = ALERT_RESOURCE_EVENT_TYPES[resourceType].some((event) => !used.has(event));
  const editable = !readOnly;

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
      {editable && editing && (
        <AlertSheet
          resourceType={resourceType}
          resourceId={resourceId}
          projectId={projectId}
          alert={editing.alert}
          used={new Set([...used].filter((event) => event !== editing.alert?.eventType))}
          onOpenChange={(next) => !next && setEditing(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="delete" pending={deleteAlert.isPending}>
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
              onClick={async (event) => {
                event.preventDefault();
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

export const ResourceAlertAction = (props: TResourceAlertsProps) => {
  const query = useV4Adapter("certManagerSettings").useAlerts({
    resourceType: props.resourceType,
    ...(props.resourceId ? { resourceId: props.resourceId } : {}),
    ...(props.projectId ? { projectId: props.projectId } : {})
  });
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
  return <ResourceAlertMenu {...props} alerts={query.data} />;
};

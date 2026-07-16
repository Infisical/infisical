import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, LockIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  OrgIcon,
  ProjectIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  SubOrgIcon,
  Switch,
  TextArea
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import {
  ALARM_EVENT_TYPE_LABELS,
  ALARM_RESOURCE_TYPE_LABELS,
  ALARM_TIME_UNIT_LABELS,
  AlarmChannelType,
  AlarmEventType,
  alarmFormSchema,
  AlarmResourceType,
  AlarmTimeUnit,
  TAlarm,
  TAlarmChannelInput,
  TAlarmForm,
  TAlarmRecipient,
  useCreateAlarm,
  useUpdateAlarm
} from "@app/hooks/api/alarms";

import { AlarmChannelsField } from "./AlarmChannelsField";

const RESOURCE_TYPE_VALUE = AlarmResourceType.IdentityCredential;
const EVENT_TYPE_VALUE = AlarmEventType.IdentityCredentialExpiry;

type Props = {
  projectId?: string;
  scopeName?: string;
  alarm?: TAlarm;
  onComplete: () => void;
  onCancel: () => void;
};

const SectionHeader = ({ step, title }: { step: number; title: string }) => (
  <p className="text-xs font-semibold tracking-wider text-mineshaft-400 uppercase">
    {step} · {title}
  </p>
);

const parseAlertBefore = (alertBefore?: string): { value: number; unit: AlarmTimeUnit } => {
  const match = alertBefore?.match(/^(\d+)([dwmy])$/);
  if (match) return { value: parseInt(match[1], 10), unit: match[2] as AlarmTimeUnit };
  return { value: 7, unit: AlarmTimeUnit.Days };
};

const buildChannelsPayload = (channels: TAlarmForm["channels"]): TAlarmChannelInput[] =>
  channels.map((channel) => {
    switch (channel.channelType) {
      case AlarmChannelType.Slack:
        return {
          channelType: AlarmChannelType.Slack,
          config: { webhookUrl: channel.config.webhookUrl },
          enabled: channel.enabled
        };
      case AlarmChannelType.Webhook: {
        const config: Record<string, unknown> = { url: channel.config.url };
        if (channel.config.signingSecret) config.signingSecret = channel.config.signingSecret;
        return { channelType: AlarmChannelType.Webhook, config, enabled: channel.enabled };
      }
      case AlarmChannelType.PagerDuty:
        return {
          channelType: AlarmChannelType.PagerDuty,
          config: { integrationKey: channel.config.integrationKey },
          enabled: channel.enabled
        };
      case AlarmChannelType.Email:
      default:
        return { channelType: AlarmChannelType.Email, config: {}, enabled: channel.enabled };
    }
  });

const buildRecipientsPayload = (channels: TAlarmForm["channels"]): TAlarmRecipient[] => {
  const seen = new Set<string>();
  const recipients: TAlarmRecipient[] = [];
  channels.forEach((channel) => {
    if (channel.channelType === AlarmChannelType.Email) {
      channel.config.recipients.forEach(({ principalType, principalId }) => {
        const key = `${principalType}:${principalId}`;
        if (!seen.has(key)) {
          seen.add(key);
          recipients.push({ principalType, principalId });
        }
      });
    }
  });
  return recipients;
};

const buildFormDefaults = (alarm?: TAlarm): TAlarmForm => {
  if (!alarm) {
    return {
      name: "",
      description: "",
      resourceType: AlarmResourceType.IdentityCredential,
      eventType: AlarmEventType.IdentityCredentialExpiry,
      alertBeforeValue: 7,
      alertBeforeUnit: AlarmTimeUnit.Days,
      enabled: true,
      channels: []
    };
  }

  const emailRecipients = alarm.recipients.map((recipient) => ({
    principalType: recipient.principalType,
    principalId: recipient.principalId,
    label: recipient.principalId
  }));

  const channels = alarm.channels
    .map((channel) => {
      switch (channel.channelType) {
        case AlarmChannelType.Email:
          return {
            channelType: AlarmChannelType.Email,
            config: { recipients: emailRecipients },
            enabled: channel.enabled
          };
        case AlarmChannelType.Slack:
          return {
            channelType: AlarmChannelType.Slack,
            config: { webhookUrl: (channel.config.webhookUrl as string) ?? "" },
            enabled: channel.enabled
          };
        case AlarmChannelType.Webhook:
          return {
            channelType: AlarmChannelType.Webhook,
            // The signing secret is never returned by the API; leave blank on edit.
            config: { url: (channel.config.url as string) ?? "", signingSecret: "" },
            enabled: channel.enabled
          };
        case AlarmChannelType.PagerDuty:
          return {
            channelType: AlarmChannelType.PagerDuty,
            config: { integrationKey: (channel.config.integrationKey as string) ?? "" },
            enabled: channel.enabled
          };
        default:
          return null;
      }
    })
    .filter(Boolean) as TAlarmForm["channels"];

  const { value, unit } = parseAlertBefore(alarm.condition?.alertBefore);

  return {
    name: alarm.name,
    description: alarm.description ?? "",
    resourceType: AlarmResourceType.IdentityCredential,
    eventType: AlarmEventType.IdentityCredentialExpiry,
    alertBeforeValue: value,
    alertBeforeUnit: unit,
    enabled: alarm.enabled,
    channels
  };
};

export const AlarmForm = ({ projectId, scopeName, alarm, onComplete, onCancel }: Props) => {
  const isEditing = Boolean(alarm);
  const scopeVariant = useScopeVariant();
  const createAlarm = useCreateAlarm();
  const updateAlarm = useUpdateAlarm();

  const formMethods = useForm<TAlarmForm>({
    resolver: zodResolver(alarmFormSchema),
    defaultValues: buildFormDefaults(alarm)
  });

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields }
  } = formMethods;

  const isProjectScope = Boolean(projectId);
  const ScopeIcon =
    // eslint-disable-next-line no-nested-ternary
    isProjectScope ? ProjectIcon : scopeVariant === "sub-org" ? SubOrgIcon : OrgIcon;
  // eslint-disable-next-line no-nested-ternary
  const scopeColor = isProjectScope
    ? "text-project"
    : scopeVariant === "sub-org"
      ? "text-sub-org"
      : "text-org";
  const scopeTitle = isProjectScope
    ? `Project · ${scopeName ?? "this project"}`
    : "Organization-wide";
  const scopeDescription = isProjectScope
    ? "Watches every identity credential in this project"
    : "Watches every identity credential in this organization";

  const onSubmit = async (data: TAlarmForm) => {
    const alertBefore = `${data.alertBeforeValue}${data.alertBeforeUnit}`;
    try {
      if (isEditing && alarm) {
        const channelsDirty = Boolean(dirtyFields.channels);
        await updateAlarm.mutateAsync({
          alarmId: alarm.id,
          projectId: alarm.projectId,
          name: data.name,
          description: data.description || null,
          enabled: data.enabled,
          condition: { alertBefore },
          ...(channelsDirty
            ? {
                channels: buildChannelsPayload(data.channels),
                recipients: buildRecipientsPayload(data.channels)
              }
            : {})
        });
        createNotification({ text: "Successfully updated alarm", type: "success" });
      } else {
        await createAlarm.mutateAsync({
          name: data.name,
          description: data.description || undefined,
          resourceType: RESOURCE_TYPE_VALUE,
          resourceId: null,
          eventType: EVENT_TYPE_VALUE,
          condition: { alertBefore },
          filters: null,
          enabled: data.enabled,
          projectId: projectId ?? null,
          recipients: buildRecipientsPayload(data.channels),
          channels: buildChannelsPayload(data.channels)
        });
        createNotification({ text: "Successfully created alarm", type: "success" });
      }
      onComplete();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to save alarm";
      createNotification({ text: message, type: "error" });
    }
  };

  return (
    <FormProvider {...formMethods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="flex flex-col gap-8 p-4">
          <section className="flex flex-col gap-4">
            <SectionHeader step={1} title="Details" />
            <Field>
              <FieldLabel htmlFor="alarm-name">Name</FieldLabel>
              <FieldContent>
                <Input
                  id="alarm-name"
                  autoFocus
                  placeholder="ci-bot-secret-expiry"
                  isError={Boolean(errors.name)}
                  {...register("name")}
                />
                <FieldError errors={[errors.name]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="alarm-description">
                Description <span className="text-mineshaft-400">(optional)</span>
              </FieldLabel>
              <FieldContent>
                <TextArea
                  id="alarm-description"
                  rows={2}
                  className="resize-none"
                  placeholder="What this alarm is for"
                  isError={Boolean(errors.description)}
                  {...register("description")}
                />
                <FieldError errors={[errors.description]} />
              </FieldContent>
            </Field>
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeader step={2} title="Trigger" />

            <Controller
              control={control}
              name="resourceType"
              render={({ field: { value, onChange } }) => (
                <Field>
                  <FieldLabel>Resource type</FieldLabel>
                  <FieldContent>
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {Object.values(AlarmResourceType).map((resourceType) => (
                          <SelectItem key={resourceType} value={resourceType}>
                            <span className="flex items-center gap-2">
                              <KeyRoundIcon className="size-4 text-blue-400" />
                              <span className="font-medium">
                                {ALARM_RESOURCE_TYPE_LABELS[resourceType]}
                              </span>
                              <span className="font-mono text-xs text-mineshaft-400">
                                {resourceType}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Scope</FieldLabel>
              <Card className="flex-row items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <ScopeIcon className={`size-5 ${scopeColor}`} />
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">{scopeTitle}</span>
                    <span className="text-xs text-muted">{scopeDescription}</span>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <LockIcon className="size-3" />
                  Fixed
                </span>
              </Card>
            </div>

            <Controller
              control={control}
              name="eventType"
              render={({ field: { value, onChange } }) => (
                <Field>
                  <FieldLabel>Event</FieldLabel>
                  <FieldContent>
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {Object.values(AlarmEventType).map((eventType) => (
                          <SelectItem key={eventType} value={eventType}>
                            <span className="flex items-center gap-2">
                              <Badge variant="warning">{ALARM_EVENT_TYPE_LABELS[eventType]}</Badge>
                              <span className="text-mineshaft-300">
                                Fires as the credential nears expiration
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Condition</FieldLabel>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-mineshaft-100">Alert before</span>
                  <Input
                    id="alarm-alert-before"
                    type="number"
                    min={1}
                    className="w-24"
                    isError={Boolean(errors.alertBeforeValue)}
                    {...register("alertBeforeValue", { valueAsNumber: true })}
                  />
                  <Controller
                    control={control}
                    name="alertBeforeUnit"
                    render={({ field: { value, onChange } }) => (
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {Object.values(AlarmTimeUnit).map((unit) => (
                            <SelectItem key={unit} value={unit} className="capitalize">
                              {ALARM_TIME_UNIT_LABELS[unit]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <FieldError errors={[errors.alertBeforeValue, errors.alertBeforeUnit]} />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeader step={3} title="Delivery" />
            <AlarmChannelsField />
          </section>
        </div>

        <SheetFooter className="sticky bottom-0 border-t bg-popover">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant={scopeVariant}
                isPending={isSubmitting}
                isDisabled={isSubmitting}
              >
                {isEditing ? "Update Alarm" : "Create Alarm"}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
                Cancel
              </Button>
            </div>
            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <FieldLabel
                  htmlFor="alarm-enabled"
                  className="flex cursor-pointer items-center gap-2 text-sm text-muted"
                >
                  Enabled
                  <Switch
                    id="alarm-enabled"
                    variant={scopeVariant}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FieldLabel>
              )}
            />
          </div>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};

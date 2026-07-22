import { ReactNode } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelpIcon, FingerprintIcon, KeyRoundIcon } from "lucide-react";

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
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import {
  ALERT_EVENT_TYPE_LABELS,
  ALERT_RESOURCE_TYPE_LABELS,
  ALERT_TIME_UNIT_LABELS,
  AlertChannelType,
  AlertEventType,
  alertFormSchema,
  AlertResourceType,
  AlertTimeUnit,
  TAlert,
  TAlertChannelInput,
  TAlertForm,
  TChannelForm,
  useCreateAlert,
  useUpdateAlert
} from "@app/hooks/api/alerts";

import { ChannelsField } from "./ChannelsField";

type Props = {
  projectId?: string;
  scopeName?: string;
  resourceId?: string;
  resourceName?: string;
  alert?: TAlert;
  onComplete: () => void;
  onCancel: () => void;
};

const SectionHeader = ({ step, title }: { step: number; title: string }) => (
  <p className="text-xs font-semibold text-label">
    {step} · {title}
  </p>
);

const FixedField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <FieldLabel>{label}</FieldLabel>
    <Card className="flex-row items-center gap-3">{children}</Card>
  </div>
);

const parseAlertBefore = (alertBefore?: string): { value: number; unit: AlertTimeUnit } => {
  const match = alertBefore?.match(/^(\d+)([dwmy])$/);
  if (match) return { value: parseInt(match[1], 10), unit: match[2] as AlertTimeUnit };
  return { value: 7, unit: AlertTimeUnit.Days };
};

const toChannelForm = (channel: TAlert["channels"][number]): TChannelForm => ({
  id: channel.id,
  channelType: channel.channelType,
  name: channel.name,
  enabled: channel.enabled,
  recipients: channel.recipients,
  webhookUrl: "",
  url: (channel.config.url as string) ?? "",
  signingSecret: "",
  integrationKey: "",
  hasWebhookUrl: Boolean(channel.config.hasWebhookUrl),
  hasSigningSecret: Boolean(channel.config.hasSigningSecret),
  hasIntegrationKey: Boolean(channel.config.hasIntegrationKey)
});

const buildFormDefaults = (alert?: TAlert): TAlertForm => {
  if (!alert) {
    return {
      name: "",
      description: "",
      resourceType: AlertResourceType.IdentityAuthentication,
      eventType: AlertEventType.IdentityCredentialExpiry,
      alertBeforeValue: 7,
      alertBeforeUnit: AlertTimeUnit.Days,
      dailyReminder: false,
      enabled: true,
      channels: []
    };
  }

  const { value, unit } = parseAlertBefore(alert.condition?.alertBefore);

  return {
    name: alert.name,
    description: alert.description ?? "",
    resourceType:
      (alert.resourceType as AlertResourceType) ?? AlertResourceType.IdentityAuthentication,
    eventType: (alert.eventType as AlertEventType) ?? AlertEventType.IdentityCredentialExpiry,
    alertBeforeValue: value,
    alertBeforeUnit: unit,
    dailyReminder: alert.condition?.dailyReminder ?? false,
    enabled: alert.enabled,
    channels: alert.channels.map(toChannelForm)
  };
};

const toChannelInput = (channel: TChannelForm): TAlertChannelInput => {
  const base: TAlertChannelInput = {
    ...(channel.id ? { id: channel.id } : {}),
    name: channel.name,
    channelType: channel.channelType,
    enabled: channel.enabled
  };

  switch (channel.channelType) {
    case AlertChannelType.Email:
      return { ...base, config: {}, recipients: channel.recipients };
    case AlertChannelType.Slack:
      return { ...base, config: channel.webhookUrl ? { webhookUrl: channel.webhookUrl } : {} };
    case AlertChannelType.Webhook:
      return {
        ...base,
        config: {
          url: channel.url,
          ...(channel.signingSecret ? { signingSecret: channel.signingSecret } : {})
        }
      };
    case AlertChannelType.PagerDuty:
      return {
        ...base,
        config: channel.integrationKey ? { integrationKey: channel.integrationKey } : {}
      };
    default:
      return { ...base, config: {} };
  }
};

export const AlertForm = ({
  projectId,
  scopeName,
  resourceId,
  resourceName,
  alert,
  onComplete,
  onCancel
}: Props) => {
  const isEditing = Boolean(alert);
  const scopeVariant = useScopeVariant();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();

  const formMethods = useForm<TAlertForm>({
    resolver: zodResolver(alertFormSchema),
    defaultValues: buildFormDefaults(alert)
  });

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = formMethods;

  const isProjectScope = Boolean(projectId);
  const isResourceScope = Boolean(resourceId ?? alert?.resourceId);
  const resolveScopeIcon = () => {
    if (isResourceScope) return FingerprintIcon;
    if (isProjectScope) return ProjectIcon;
    if (scopeVariant === "sub-org") return SubOrgIcon;
    return OrgIcon;
  };
  const ScopeIcon = resolveScopeIcon();
  // eslint-disable-next-line no-nested-ternary
  const scopeColor = isProjectScope
    ? "text-project"
    : scopeVariant === "sub-org"
      ? "text-sub-org"
      : "text-org";
  // eslint-disable-next-line no-nested-ternary
  const scopeTitle = isResourceScope
    ? `${resourceName ?? "this identity"}`
    : isProjectScope
      ? `Project · ${scopeName ?? "this project"}`
      : "Organization";
  // eslint-disable-next-line no-nested-ternary
  const scopeDescription = isResourceScope
    ? "Watches this machine identity's authentications"
    : isProjectScope
      ? "Watches every identity credential in this project"
      : "Watches every identity credential in this organization";

  const onSubmit = async (data: TAlertForm) => {
    const alertBefore = `${data.alertBeforeValue}${data.alertBeforeUnit}`;
    const condition = { alertBefore, dailyReminder: data.dailyReminder };
    const channels = data.channels.map(toChannelInput);
    try {
      if (isEditing && alert) {
        await updateAlert.mutateAsync({
          alertId: alert.id,
          name: data.name,
          description: data.description || null,
          enabled: data.enabled,
          condition,
          channels
        });
        createNotification({ text: "Successfully updated alert", type: "success" });
      } else {
        await createAlert.mutateAsync({
          name: data.name,
          description: data.description || undefined,
          resourceType: data.resourceType,
          resourceId: resourceId ?? null,
          eventType: data.eventType,
          condition,
          enabled: data.enabled,
          projectId: projectId ?? null,
          channels
        });
        createNotification({ text: "Successfully created alert", type: "success" });
      }
      onComplete();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to save alert";
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
              <FieldLabel htmlFor="alert-name">Name</FieldLabel>
              <FieldContent>
                <Input
                  id="alert-name"
                  autoFocus
                  placeholder="ci-bot-secret-expiry"
                  isError={Boolean(errors.name)}
                  {...register("name")}
                />
                <FieldError errors={[errors.name]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="alert-description">
                Description <span className="text-muted">(optional)</span>
              </FieldLabel>
              <FieldContent>
                <TextArea
                  id="alert-description"
                  rows={2}
                  className="resize-none"
                  placeholder="What this alert is for"
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
              render={({ field: { value, onChange } }) =>
                isResourceScope ? (
                  <FixedField label="Resource type">
                    <KeyRoundIcon className="size-5 text-muted" />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">
                        {ALERT_RESOURCE_TYPE_LABELS[value]}
                      </span>
                      <span className="font-mono text-xs text-muted">{value}</span>
                    </div>
                  </FixedField>
                ) : (
                  <Field>
                    <FieldLabel>Resource type</FieldLabel>
                    <FieldContent>
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {Object.values(AlertResourceType).map((resourceType) => (
                            <SelectItem key={resourceType} value={resourceType}>
                              <span className="flex items-center gap-2">
                                <KeyRoundIcon className="size-4 text-muted" />
                                <span className="font-medium">
                                  {ALERT_RESOURCE_TYPE_LABELS[resourceType]}
                                </span>
                                <span className="font-mono text-xs text-muted">{resourceType}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldContent>
                  </Field>
                )
              }
            />

            <FixedField label="Scope">
              <ScopeIcon className={`size-5 ${scopeColor}`} />
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{scopeTitle}</span>
                <span className="text-xs text-muted">{scopeDescription}</span>
              </div>
            </FixedField>

            <Controller
              control={control}
              name="eventType"
              render={({ field: { value } }) => (
                <FixedField label="Event">
                  <Badge variant="warning">{ALERT_EVENT_TYPE_LABELS[value]}</Badge>
                  <span className="text-xs text-muted">
                    Fires as the credential nears expiration
                  </span>
                </FixedField>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <FieldLabel>Alert before</FieldLabel>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <Input
                    id="alert-alert-before"
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
                          {Object.values(AlertTimeUnit).map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {ALERT_TIME_UNIT_LABELS[unit]}
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

            <Controller
              control={control}
              name="dailyReminder"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <FieldLabel htmlFor="alert-repeat-daily" className="cursor-pointer">
                    Daily Reminder
                  </FieldLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelpIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Send a reminder every day from the alert threshold until the event happens
                    </TooltipContent>
                  </Tooltip>
                  <Switch
                    id="alert-repeat-daily"
                    variant={scopeVariant}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeader step={3} title="Delivery" />
            <ChannelsField projectId={projectId} />
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
                {isEditing ? "Update Alert" : "Create Alert"}
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
                  htmlFor="alert-enabled"
                  className="flex cursor-pointer items-center gap-2 text-sm text-muted"
                >
                  Enabled
                  <Switch
                    id="alert-enabled"
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

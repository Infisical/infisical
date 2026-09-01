import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClockAlertIcon, KeyRoundIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  Switch,
  TextArea
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import {
  ALERT_RESOURCE_TYPE_LABELS,
  AlertEventType,
  alertFormSchema,
  AlertResourceType,
  MAX_ALERT_BEFORE_DAYS,
  MIN_ALERT_BEFORE_DAYS,
  parseAlertBeforeDays,
  TAlert,
  TAlertForm,
  TChannelForm,
  toAlertBefore,
  toChannelInput,
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

const DEFAULT_ALERT_BEFORE_DAYS = 7;
const DEFAULT_ALERT_NAME = "Secret expiration alert";

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
      name: DEFAULT_ALERT_NAME,
      description: "",
      resourceType: AlertResourceType.IdentityAuthentication,
      eventType: AlertEventType.IdentityAuthenticationExpiry,
      alertBeforeDays: DEFAULT_ALERT_BEFORE_DAYS,
      dailyReminder: false,
      enabled: true,
      channels: []
    };
  }

  return {
    name: alert.name,
    description: alert.description ?? "",
    resourceType:
      (alert.resourceType as AlertResourceType) ?? AlertResourceType.IdentityAuthentication,
    eventType: (alert.eventType as AlertEventType) ?? AlertEventType.IdentityAuthenticationExpiry,
    alertBeforeDays:
      parseAlertBeforeDays(alert.condition?.alertBefore) ?? DEFAULT_ALERT_BEFORE_DAYS,
    dailyReminder: alert.condition?.dailyReminder ?? false,
    enabled: alert.enabled,
    channels: alert.channels.map(toChannelForm)
  };
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

  const resourceTypeValue = useWatch({ control, name: "resourceType" });
  const isProjectScope = Boolean(projectId);
  const isResourceScope = Boolean(resourceId ?? alert?.resourceId);
  // eslint-disable-next-line no-nested-ternary
  const watchTarget = isResourceScope
    ? (resourceName ?? "this machine identity")
    : isProjectScope
      ? `every machine identity in ${scopeName ?? "this project"}`
      : `every machine identity in this ${scopeVariant === "sub-org" ? "sub-organization" : "organization"}`;

  const onSubmit = async (data: TAlertForm) => {
    const condition = {
      alertBefore: toAlertBefore(data.alertBeforeDays),
      dailyReminder: data.dailyReminder
    };
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
    } catch {
      // MutationCache reports request errors globally; keep the form open for another attempt.
    }
  };

  return (
    <FormProvider {...formMethods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="flex flex-col gap-5 p-4">
          <Field>
            <FieldLabel htmlFor="alert-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="alert-name"
                autoFocus
                placeholder={DEFAULT_ALERT_NAME}
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
                rows={3}
                placeholder="What is this alert for?"
                isError={Boolean(errors.description)}
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </FieldContent>
          </Field>

          <Alert className="items-start [&>svg]:mt-0.5 [&>svg]:text-info">
            <ClockAlertIcon />
            <AlertDescription>
              <span>
                Watching <span className="font-medium text-foreground">{watchTarget}</span> ·
                Universal Auth client secret expiration
              </span>
            </AlertDescription>
          </Alert>

          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <Label
                htmlFor="alert-enabled"
                className="cursor-pointer justify-between rounded-md border border-border px-3 py-2.5 font-normal"
              >
                Enabled
                <Switch
                  id="alert-enabled"
                  variant={scopeVariant}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Label>
            )}
          />

          {!isResourceScope && (
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
              )}
            />
          )}

          <div className="mb-1 flex flex-col gap-1.5">
            <Label htmlFor="alert-alert-before">Condition</Label>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-foreground">
              <span>Alert</span>
              <Input
                id="alert-alert-before"
                type="number"
                min={MIN_ALERT_BEFORE_DAYS}
                max={MAX_ALERT_BEFORE_DAYS}
                className="w-16 text-center"
                isError={Boolean(errors.alertBeforeDays)}
                {...register("alertBeforeDays", { valueAsNumber: true })}
              />
              <span>days before a client secret expires</span>
            </div>
            <FieldError errors={[errors.alertBeforeDays]} />
            <Controller
              control={control}
              name="dailyReminder"
              render={({ field }) => (
                <Label htmlFor="alert-repeat-daily" className="cursor-pointer font-normal">
                  <Checkbox
                    id="alert-repeat-daily"
                    variant={scopeVariant}
                    isChecked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  Repeat daily until the secret is rotated
                </Label>
              )}
            />
          </div>

          <ChannelsField
            projectId={projectId}
            resourceType={resourceTypeValue}
            resourceId={resourceId ?? alert?.resourceId ?? null}
          />
        </div>

        <SheetFooter className="sticky bottom-0 border-t bg-popover">
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
        </SheetFooter>
      </form>
    </FormProvider>
  );
};

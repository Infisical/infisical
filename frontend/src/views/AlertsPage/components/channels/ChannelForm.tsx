import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon, HashIcon, LinkIcon, MailIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  Switch
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import {
  buildChannelFormSchema,
  TAlertChannel,
  TAlertChannelForm,
  TAlertChannelRecipientForm,
  useCreateAlertChannel,
  useUpdateAlertChannel
} from "@app/hooks/api/alertChannels";
import { ALERT_CHANNEL_TYPE_LABELS, AlertChannelType } from "@app/hooks/api/alerts";

import { ChannelRecipientsField } from "./ChannelRecipientsField";

const CHANNEL_TYPES: { type: AlertChannelType; icon: typeof MailIcon }[] = [
  { type: AlertChannelType.Email, icon: MailIcon },
  { type: AlertChannelType.Slack, icon: HashIcon },
  { type: AlertChannelType.Webhook, icon: LinkIcon },
  { type: AlertChannelType.PagerDuty, icon: AlertTriangleIcon }
];

const DIRECTED_TYPES = new Set<AlertChannelType>([AlertChannelType.Email]);

type Props = {
  projectId?: string;
  channel?: TAlertChannel;
  onComplete: (channelId: string) => void;
  onCancel: () => void;
};

const buildDefaults = (channel?: TAlertChannel): Partial<TAlertChannelForm> => {
  if (!channel) {
    return { name: "", channelType: AlertChannelType.Email, enabled: true, recipients: [] };
  }
  const config = channel.config ?? {};
  return {
    name: channel.name,
    channelType: channel.channelType,
    enabled: channel.enabled,
    url: (config.url as string) ?? "",
    webhookUrl: "",
    signingSecret: "",
    integrationKey: "",
    recipients: channel.recipients.map((r) => ({
      principalType: r.principalType,
      principalId: r.principalId,
      label: r.principalId
    })) as TAlertChannelRecipientForm[]
  };
};

export const ChannelForm = ({ projectId, channel, onComplete, onCancel }: Props) => {
  const isEditing = Boolean(channel);
  const scopeVariant = useScopeVariant();
  const createChannel = useCreateAlertChannel();
  const updateChannel = useUpdateAlertChannel();
  const [clearSigningSecret, setClearSigningSecret] = useState(false);

  const formMethods = useForm<TAlertChannelForm>({
    resolver: zodResolver(buildChannelFormSchema(isEditing)),
    defaultValues: buildDefaults(channel) as TAlertChannelForm
  });
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = formMethods;

  const channelType = watch("channelType");
  const hasSigningSecret = Boolean(channel?.config?.hasSigningSecret);

  const buildConfig = (data: TAlertChannelForm): Record<string, unknown> => {
    switch (data.channelType) {
      case AlertChannelType.Slack:
        // Blank on edit => omit so the server keeps the existing URL.
        return data.webhookUrl ? { webhookUrl: data.webhookUrl } : {};
      case AlertChannelType.Webhook: {
        const config: Record<string, unknown> = { url: data.url };
        if (clearSigningSecret) config.signingSecret = "";
        else if (data.signingSecret) config.signingSecret = data.signingSecret;
        return config;
      }
      case AlertChannelType.PagerDuty:
        return data.integrationKey ? { integrationKey: data.integrationKey } : {};
      case AlertChannelType.Email:
      default:
        return {};
    }
  };

  const onSubmit = async (data: TAlertChannelForm) => {
    const recipients = DIRECTED_TYPES.has(data.channelType)
      ? (data.recipients ?? []).map((r) => ({
          principalType: r.principalType,
          principalId: r.principalId
        }))
      : [];
    try {
      if (isEditing && channel) {
        const updated = await updateChannel.mutateAsync({
          channelId: channel.id,
          projectId: channel.projectId,
          name: data.name,
          enabled: data.enabled,
          config: buildConfig(data),
          ...(DIRECTED_TYPES.has(data.channelType) ? { recipients } : {})
        });
        createNotification({ text: "Successfully updated channel", type: "success" });
        onComplete(updated.id);
      } else {
        const created = await createChannel.mutateAsync({
          name: data.name,
          channelType: data.channelType,
          enabled: data.enabled,
          config: buildConfig(data),
          projectId: projectId ?? null,
          ...(DIRECTED_TYPES.has(data.channelType) ? { recipients } : {})
        });
        createNotification({ text: "Successfully created channel", type: "success" });
        onComplete(created.id);
      }
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to save channel";
      createNotification({ text: message, type: "error" });
    }
  };

  return (
    <FormProvider {...formMethods}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="flex flex-col gap-6 p-4">
          <Field>
            <FieldLabel htmlFor="channel-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="channel-name"
                autoFocus
                placeholder="#sre-alerts"
                isError={Boolean(errors.name)}
                {...register("name")}
              />
              <FieldDescription>Shown when picking a channel on an alert.</FieldDescription>
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>

          <Controller
            control={control}
            name="channelType"
            render={({ field }) => (
              <Field>
                <FieldLabel>Channel type</FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isEditing}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a channel type" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {CHANNEL_TYPES.map(({ type, icon: Icon }) => (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            <Icon className="size-4 text-muted" />
                            {ALERT_CHANNEL_TYPE_LABELS[type]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />

          {channelType === AlertChannelType.Email && (
            <ChannelRecipientsField projectId={projectId} />
          )}

          {channelType === AlertChannelType.Slack && (
            <Controller
              control={control}
              name="webhookUrl"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Incoming webhook URL</FieldLabel>
                  <FieldContent>
                    <Input
                      placeholder="https://hooks.slack.com/services/T0/B0/xxxx"
                      isError={Boolean(error)}
                      value={(field.value as string) ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                    {isEditing && (
                      <FieldDescription>
                        Existing URL is hidden; leave blank to keep it.
                      </FieldDescription>
                    )}
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}

          {channelType === AlertChannelType.Webhook && (
            <div className="flex flex-col gap-4">
              <Controller
                control={control}
                name="url"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Webhook URL</FieldLabel>
                    <FieldContent>
                      <Input
                        placeholder="https://api.example.com/webhook"
                        isError={Boolean(error)}
                        value={(field.value as string) ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="signingSecret"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>
                      Signing secret <span className="text-mineshaft-400">(optional)</span>
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        type="password"
                        placeholder="Enter signing secret..."
                        isError={Boolean(error)}
                        disabled={clearSigningSecret}
                        value={(field.value as string) ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                      {isEditing && hasSigningSecret && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                          <Checkbox
                            id="clear-signing-secret"
                            isChecked={clearSigningSecret}
                            onCheckedChange={(checked) => setClearSigningSecret(Boolean(checked))}
                          >
                            Remove the existing signing secret
                          </Checkbox>
                        </div>
                      )}
                      <FieldDescription>
                        Adds an x-infisical-signature header so receivers can verify payloads.
                        {isEditing && " Leave blank to keep the current secret."}
                      </FieldDescription>
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </div>
          )}

          {channelType === AlertChannelType.PagerDuty && (
            <Controller
              control={control}
              name="integrationKey"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Integration key</FieldLabel>
                  <FieldContent>
                    <Input
                      placeholder="32-character hex integration key"
                      isError={Boolean(error)}
                      value={(field.value as string) ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                    {isEditing && (
                      <FieldDescription>
                        Existing key is hidden; leave blank to keep it.
                      </FieldDescription>
                    )}
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          )}
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
                {isEditing ? "Update Channel" : "Add Channel"}
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
                  htmlFor="channel-enabled"
                  className="flex cursor-pointer items-center gap-2 text-sm text-muted"
                >
                  Enabled
                  <Switch
                    id="channel-enabled"
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

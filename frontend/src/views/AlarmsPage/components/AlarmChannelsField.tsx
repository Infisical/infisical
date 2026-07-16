import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import {
  BellIcon,
  ChevronDownIcon,
  HashIcon,
  LinkIcon,
  MailIcon,
  PlusIcon,
  Trash2Icon
} from "lucide-react";

import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Switch
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { ALARM_CHANNEL_TYPE_LABELS, AlarmChannelType, TAlarmForm } from "@app/hooks/api/alarms";

import { AlarmRecipientsField } from "./AlarmRecipientsField";

const MAX_CHANNELS = 10;

const CHANNEL_ICONS: Record<AlarmChannelType, typeof MailIcon> = {
  [AlarmChannelType.Email]: MailIcon,
  [AlarmChannelType.Slack]: HashIcon,
  [AlarmChannelType.Webhook]: LinkIcon,
  [AlarmChannelType.PagerDuty]: BellIcon
};

const getDefaultConfig = (type: AlarmChannelType): Record<string, unknown> => {
  switch (type) {
    case AlarmChannelType.Email:
      return { recipients: [] };
    case AlarmChannelType.Slack:
      return { webhookUrl: "" };
    case AlarmChannelType.Webhook:
      return { url: "", signingSecret: "" };
    case AlarmChannelType.PagerDuty:
      return { integrationKey: "" };
    default:
      return {};
  }
};

export const AlarmChannelsField = () => {
  const {
    control,
    watch,
    formState: { errors }
  } = useFormContext<TAlarmForm>();

  const { fields, append, remove } = useFieldArray({ control, name: "channels" });
  const scopeVariant = useScopeVariant();

  const channels = watch("channels");
  const hasEmailChannel = channels?.some(
    (channel) => channel.channelType === AlarmChannelType.Email
  );
  const isLimitReached = fields.length >= MAX_CHANNELS;

  const addChannel = (type: AlarmChannelType) => {
    append({ channelType: type, config: getDefaultConfig(type), enabled: true } as never);
  };

  const rootError = errors.channels?.message || errors.channels?.root?.message;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm text-mineshaft-100">Notification Channels</span>
          <span className="text-xs text-mineshaft-400">
            Where this alarm delivers when it fires.
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isLimitReached}>
            <Button type="button" variant="outline" size="sm" isDisabled={isLimitReached}>
              <PlusIcon className="size-4" />
              Add Channel
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
          >
            <DropdownMenuItem
              isDisabled={hasEmailChannel}
              onClick={() => addChannel(AlarmChannelType.Email)}
            >
              <MailIcon />
              Email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addChannel(AlarmChannelType.Slack)}>
              <HashIcon />
              Slack
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addChannel(AlarmChannelType.Webhook)}>
              <LinkIcon />
              Webhook
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addChannel(AlarmChannelType.PagerDuty)}>
              <BellIcon />
              PagerDuty
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rootError && <p className="text-xs text-red-500">{rootError}</p>}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
          No channels added yet. Add at least one channel to receive notifications.
        </div>
      ) : (
        fields.map((field, index) => {
          const channelType = channels?.[index]?.channelType;
          const Icon = channelType ? CHANNEL_ICONS[channelType] : BellIcon;

          return (
            <Card key={field.id} className="gap-0 p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Icon className="size-4 text-muted" />
                  {channelType ? ALARM_CHANNEL_TYPE_LABELS[channelType] : "Channel"}
                </div>
                <div className="flex items-center gap-3">
                  <Controller
                    control={control}
                    name={`channels.${index}.enabled`}
                    render={({ field: enabledField }) => (
                      <Switch
                        id={`channel-enabled-${field.id}`}
                        size="sm"
                        variant={scopeVariant}
                        checked={enabledField.value}
                        onCheckedChange={enabledField.onChange}
                      />
                    )}
                  />
                  <IconButton
                    aria-label="Remove channel"
                    variant="ghost"
                    size="xs"
                    onClick={() => remove(index)}
                  >
                    <Trash2Icon className="size-4" />
                  </IconButton>
                </div>
              </div>

              <div className="p-4">
                {channelType === AlarmChannelType.Email && <AlarmRecipientsField index={index} />}

                {channelType === AlarmChannelType.Slack && (
                  <Controller
                    control={control}
                    name={`channels.${index}.config.webhookUrl`}
                    render={({ field: urlField, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel>Slack Webhook URL</FieldLabel>
                        <FieldContent>
                          <Input
                            placeholder="https://hooks.slack.com/services/..."
                            isError={Boolean(error)}
                            value={(urlField.value as string) ?? ""}
                            onChange={urlField.onChange}
                            onBlur={urlField.onBlur}
                          />
                          <FieldDescription>
                            Create an Incoming Webhook in your Slack workspace settings. Existing
                            URLs are hidden; leave blank to keep the current one.
                          </FieldDescription>
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    )}
                  />
                )}

                {channelType === AlarmChannelType.Webhook && (
                  <div className="flex flex-col gap-4">
                    <Controller
                      control={control}
                      name={`channels.${index}.config.url`}
                      render={({ field: urlField, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel>Webhook URL</FieldLabel>
                          <FieldContent>
                            <Input
                              placeholder="https://api.example.com/webhook"
                              isError={Boolean(error)}
                              value={(urlField.value as string) ?? ""}
                              onChange={urlField.onChange}
                              onBlur={urlField.onBlur}
                            />
                            <FieldError errors={[error]} />
                          </FieldContent>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name={`channels.${index}.config.signingSecret`}
                      render={({ field: secretField, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel>
                            Signing Secret <span className="text-mineshaft-400">(optional)</span>
                          </FieldLabel>
                          <FieldContent>
                            <Input
                              type="password"
                              placeholder="Enter signing secret..."
                              isError={Boolean(error)}
                              value={(secretField.value as string) ?? ""}
                              onChange={secretField.onChange}
                              onBlur={secretField.onBlur}
                            />
                            <FieldDescription>
                              Adds an x-infisical-signature header so receivers can verify payloads.
                              Existing secrets are hidden; leave blank to keep the webhook unsigned.
                            </FieldDescription>
                            <FieldError errors={[error]} />
                          </FieldContent>
                        </Field>
                      )}
                    />
                  </div>
                )}

                {channelType === AlarmChannelType.PagerDuty && (
                  <Controller
                    control={control}
                    name={`channels.${index}.config.integrationKey`}
                    render={({ field: keyField, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel>Integration Key</FieldLabel>
                        <FieldContent>
                          <Input
                            placeholder="32-character hex integration key"
                            isError={Boolean(error)}
                            value={(keyField.value as string) ?? ""}
                            onChange={keyField.onChange}
                            onBlur={keyField.onBlur}
                          />
                          <FieldDescription>
                            Find this in PagerDuty under Services → Integrations → Events API v2.
                            Existing keys are hidden; leave blank to keep the current one.
                          </FieldDescription>
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    )}
                  />
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
};

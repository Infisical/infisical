import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SendIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Label,
  Switch
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  TAlertForm,
  toChannelInput,
  useTestAlertChannel
} from "@app/hooks/api/alerts";

import { getChannelIcon } from "./channelIcons";
import { ChannelRecipientsField } from "./ChannelRecipientsField";

type Props = {
  index: number;
  projectId?: string;
  resourceType: string;
  resourceId?: string | null;
  onRemove: () => void;
  canRemove: boolean;
};

const KEEP_PLACEHOLDER = "•••••••• (leave blank to keep)";

export const ChannelCard = ({
  index,
  projectId,
  resourceType,
  resourceId,
  onRemove,
  canRemove
}: Props) => {
  const scopeVariant = useScopeVariant();
  const {
    control,
    register,
    getValues,
    trigger,
    formState: { errors }
  } = useFormContext<TAlertForm>();
  const testChannel = useTestAlertChannel();

  const channel = useWatch({ control, name: `channels.${index}` });
  const channelType = channel?.channelType;
  const isExisting = Boolean(channel?.id);
  const channelErrors = errors.channels?.[index];

  const Icon = getChannelIcon(channelType);
  const channelLabel = ALERT_CHANNEL_TYPE_LABELS[channelType];

  const onTest = async () => {
    if (!(await trigger(`channels.${index}`))) return;

    const { config, recipients } = toChannelInput(getValues(`channels.${index}`));
    try {
      const result = await testChannel.mutateAsync({
        resourceType,
        resourceId,
        projectId: projectId ?? null,
        channelId: channel?.id,
        channelType,
        config,
        recipients
      });

      if (result.success) {
        createNotification({
          text: `Test ${channelLabel} alert sent${
            result.deliveredTo && result.deliveredTo > 1
              ? ` to ${result.deliveredTo} recipients`
              : ""
          }`,
          type: "success"
        });
      } else {
        createNotification({
          title: `Test ${channelLabel} notification failed`,
          text: result.error ?? "The channel could not be reached.",
          type: "error"
        });
      }
    } catch {
      // MutationCache reports request errors (including the cooldown) globally.
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted" />
          <span className="text-sm font-medium text-foreground">{channelLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onTest}
            isPending={testChannel.isPending}
            isDisabled={testChannel.isPending}
          >
            <SendIcon className="size-3.5" />
            Send test
          </Button>
          <Controller
            control={control}
            name={`channels.${index}.enabled`}
            render={({ field }) => (
              <Label
                htmlFor={`channel-${index}-enabled`}
                className="cursor-pointer text-xs font-normal text-muted"
              >
                Enabled
                <Switch
                  id={`channel-${index}-enabled`}
                  variant={scopeVariant}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Label>
            )}
          />
          {canRemove && (
            <IconButton aria-label="Remove channel" variant="ghost" size="xs" onClick={onRemove}>
              <TrashIcon className="size-4" />
            </IconButton>
          )}
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor={`channel-${index}-name`}>Name</FieldLabel>
        <FieldContent>
          <Input
            id={`channel-${index}-name`}
            placeholder="Notify on-call"
            isError={Boolean(channelErrors?.name)}
            {...register(`channels.${index}.name`)}
          />
          <FieldError errors={[channelErrors?.name]} />
        </FieldContent>
      </Field>

      {channelType === AlertChannelType.Email && (
        <Field>
          <FieldLabel>Recipients</FieldLabel>
          <FieldContent>
            <Controller
              control={control}
              name={`channels.${index}.recipients`}
              render={({ field }) => (
                <ChannelRecipientsField
                  projectId={projectId}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  isError={Boolean(channelErrors?.recipients)}
                />
              )}
            />
            <FieldError errors={[channelErrors?.recipients as { message?: string } | undefined]} />
          </FieldContent>
        </Field>
      )}

      {channelType === AlertChannelType.Slack && (
        <Field>
          <FieldLabel htmlFor={`channel-${index}-webhookUrl`}>Webhook URL</FieldLabel>
          <FieldContent>
            <Input
              id={`channel-${index}-webhookUrl`}
              type="password"
              placeholder={
                isExisting && channel?.hasWebhookUrl
                  ? KEEP_PLACEHOLDER
                  : "https://hooks.slack.com/..."
              }
              isError={Boolean(channelErrors?.webhookUrl)}
              {...register(`channels.${index}.webhookUrl`)}
            />
            <FieldError errors={[channelErrors?.webhookUrl]} />
          </FieldContent>
        </Field>
      )}

      {channelType === AlertChannelType.Webhook && (
        <>
          <Field>
            <FieldLabel htmlFor={`channel-${index}-url`}>URL</FieldLabel>
            <FieldContent>
              <Input
                id={`channel-${index}-url`}
                placeholder="https://example.com/webhook"
                isError={Boolean(channelErrors?.url)}
                {...register(`channels.${index}.url`)}
              />
              <FieldError errors={[channelErrors?.url]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor={`channel-${index}-signingSecret`}>
              Signing secret <span className="text-muted">(optional)</span>
            </FieldLabel>
            <FieldContent>
              <Input
                id={`channel-${index}-signingSecret`}
                type="password"
                placeholder={isExisting && channel?.hasSigningSecret ? KEEP_PLACEHOLDER : ""}
                isError={Boolean(channelErrors?.signingSecret)}
                {...register(`channels.${index}.signingSecret`)}
              />
              <FieldError errors={[channelErrors?.signingSecret]} />
            </FieldContent>
          </Field>
        </>
      )}

      {channelType === AlertChannelType.PagerDuty && (
        <Field>
          <FieldLabel htmlFor={`channel-${index}-integrationKey`}>Integration key</FieldLabel>
          <FieldContent>
            <Input
              id={`channel-${index}-integrationKey`}
              type="password"
              placeholder={
                isExisting && channel?.hasIntegrationKey
                  ? KEEP_PLACEHOLDER
                  : "32-character integration key"
              }
              isError={Boolean(channelErrors?.integrationKey)}
              {...register(`channels.${index}.integrationKey`)}
            />
            <FieldError errors={[channelErrors?.integrationKey]} />
          </FieldContent>
        </Field>
      )}
    </div>
  );
};

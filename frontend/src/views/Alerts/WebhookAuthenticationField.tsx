import { Controller, useFormContext, useWatch } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  isWebhookUrlChanged,
  TChannelsForm,
  WEBHOOK_AUTH_FIELDS,
  WebhookAuthType
} from "@app/hooks/api/alerts";

import { ChannelSecretInput, KEEP_PLACEHOLDER } from "./ChannelSecretInput";

type Props = {
  index: number;
};

export const WebhookAuthenticationField = ({ index }: Props) => {
  const {
    control,
    register,
    setValue,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const channel = useWatch({ control, name: `channels.${index}` });
  const channelErrors = errors.channels?.[index];
  const authType = channel?.authType;

  const setAuthType = (type?: WebhookAuthType) =>
    setValue(`channels.${index}.authType`, type, { shouldDirty: true });

  const label = (
    <FieldLabelWithTooltip tooltip="Credentials sent with each request, for endpoints that require a token, password, or API key.">
      Authentication <span className="text-muted">(optional)</span>
    </FieldLabelWithTooltip>
  );

  if (!authType) {
    return (
      <Field>
        {label}
        <FieldContent>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="self-start"
            onClick={() => setAuthType(WebhookAuthType.Bearer)}
          >
            <PlusIcon className="size-3.5" />
            Add authentication
          </Button>
        </FieldContent>
      </Field>
    );
  }

  const { name, secret } = WEBHOOK_AUTH_FIELDS[authType];
  const isUrlChanged = isWebhookUrlChanged(channel);
  const hasSavedSecret = Boolean(channel.id && channel[secret.hasSaved]);

  return (
    <Field>
      {label}
      <FieldContent>
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <Controller
              control={control}
              name={`channels.${index}.authType`}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label="Authentication type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(WebhookAuthType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {WEBHOOK_AUTH_FIELDS[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <IconButton
              aria-label="Remove authentication"
              variant="outline"
              onClick={() => setAuthType(undefined)}
            >
              <TrashIcon className="size-4" />
            </IconButton>
          </div>
          <div className="flex items-start gap-2">
            {name && (
              <Field className="w-2/5">
                <Input
                  key={name.field}
                  aria-label={name.label}
                  placeholder={name.placeholder}
                  isError={Boolean(channelErrors?.[name.field])}
                  {...register(`channels.${index}.${name.field}`)}
                />
                <FieldError errors={[channelErrors?.[name.field]]} />
              </Field>
            )}
            <Field className="grow">
              <ChannelSecretInput
                key={secret.field}
                id={`channel-${index}-${secret.field}`}
                ariaLabel={secret.label}
                placeholder={hasSavedSecret && !isUrlChanged ? KEEP_PLACEHOLDER : secret.label}
                isError={Boolean(channelErrors?.[secret.field])}
                registration={register(`channels.${index}.${secret.field}`)}
              />
              <FieldError errors={[channelErrors?.[secret.field]]} />
            </Field>
          </div>
          {hasSavedSecret && isUrlChanged && (
            <p className="text-xs text-muted">
              The URL changed, so enter the {secret.label.toLowerCase()} again. Saved credentials
              are only sent to the URL they were saved with.
            </p>
          )}
        </div>
      </FieldContent>
    </Field>
  );
};

import { useFormContext, useWatch } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Button, Field, FieldContent, FieldError, IconButton } from "@app/components/v3";
import { TChannelsForm } from "@app/hooks/api/alerts";

import { ChannelSecretInput, KEEP_PLACEHOLDER } from "./ChannelSecretInput";

type Props = {
  index: number;
};

export const WebhookSigningSecretField = ({ index }: Props) => {
  const {
    control,
    register,
    setValue,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const [isEnabled, hasSigningSecret, channelId] = useWatch({
    control,
    name: [
      `channels.${index}.signingSecretEnabled`,
      `channels.${index}.hasSigningSecret`,
      `channels.${index}.id`
    ]
  });

  const setEnabled = (enabled: boolean) => {
    setValue(`channels.${index}.signingSecretEnabled`, enabled, { shouldDirty: true });
    setValue(`channels.${index}.signingSecret`, "");
  };

  return (
    <Field>
      <FieldLabelWithTooltip
        htmlFor={isEnabled ? `channel-${index}-signingSecret` : undefined}
        tooltip="Signs each request in the x-infisical-signature header so your endpoint can verify it came from Infisical."
      >
        Signing secret <span className="text-muted">(optional)</span>
      </FieldLabelWithTooltip>
      <FieldContent>
        {isEnabled ? (
          <>
            <div className="flex items-start gap-2">
              <div className="grow">
                <ChannelSecretInput
                  id={`channel-${index}-signingSecret`}
                  placeholder={channelId && hasSigningSecret ? KEEP_PLACEHOLDER : ""}
                  isError={Boolean(errors.channels?.[index]?.signingSecret)}
                  registration={register(`channels.${index}.signingSecret`)}
                />
              </div>
              <IconButton
                aria-label="Remove signing secret"
                variant="outline"
                onClick={() => setEnabled(false)}
              >
                <TrashIcon className="size-4" />
              </IconButton>
            </div>
            <FieldError errors={[errors.channels?.[index]?.signingSecret]} />
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="self-start"
            onClick={() => setEnabled(true)}
          >
            <PlusIcon className="size-3.5" />
            Add Signing Secret
          </Button>
        )}
      </FieldContent>
    </Field>
  );
};

import { useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { ALERT_CHANNEL_REDACTED_VALUE, TChannelsForm } from "@app/hooks/api/alerts";

import { ChannelSecretInput } from "./ChannelSecretInput";

type Props = {
  index: number;
  isExisting: boolean;
};

export const WebhookHeadersField = ({ index, isExisting }: Props) => {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const { fields, append, remove } = useFieldArray({ control, name: `channels.${index}.headers` });
  const headerErrors = errors.channels?.[index]?.headers;

  return (
    <Field>
      <FieldLabel>
        Headers <span className="text-muted">(optional)</span>
      </FieldLabel>
      <FieldContent>
        <div className="flex flex-col gap-2">
          {fields.map((field, i) => {
            const valueName = `channels.${index}.headers.${i}.value` as const;
            return (
              <div key={field.id} className="flex items-start gap-2">
                <Field className="w-2/5">
                  <Input
                    aria-label="Header name"
                    placeholder="Authorization"
                    isError={Boolean(headerErrors?.[i]?.key)}
                    {...register(`channels.${index}.headers.${i}.key`)}
                  />
                  <FieldError errors={[headerErrors?.[i]?.key]} />
                </Field>
                <Field className="grow">
                  <ChannelSecretInput
                    id={`channel-${index}-header-${i}-value`}
                    ariaLabel="Header value"
                    placeholder="Bearer <token>"
                    isError={Boolean(headerErrors?.[i]?.value)}
                    registration={register(valueName)}
                    onFocus={() => {
                      if (getValues(valueName) !== ALERT_CHANNEL_REDACTED_VALUE) return;
                      setValue(valueName, "");
                    }}
                    onBlur={() => {
                      if (
                        field.value !== ALERT_CHANNEL_REDACTED_VALUE ||
                        getValues(valueName) !== ""
                      )
                        return;
                      setValue(valueName, ALERT_CHANNEL_REDACTED_VALUE);
                    }}
                  />
                  <FieldError errors={[headerErrors?.[i]?.value]} />
                </Field>
                <IconButton aria-label="Remove header" variant="outline" onClick={() => remove(i)}>
                  <TrashIcon className="size-4" />
                </IconButton>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="self-start"
            onClick={() => append({ key: "", value: "" })}
          >
            <PlusIcon className="size-3.5" />
            Add header
          </Button>
          {isExisting && fields.length > 0 && (
            <p className="text-xs text-muted">
              Saved values are hidden. Leave a value unchanged to keep it.
            </p>
          )}
        </div>
      </FieldContent>
    </Field>
  );
};

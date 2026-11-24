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
import { TChannelsForm } from "@app/hooks/api/alerts";

import { getChannelErrors, useChannelPath } from "./channelPath";

type Props = {
  index: number;
};

export const WebhookHeadersField = ({ index }: Props) => {
  const {
    control,
    register,
    formState: { errors }
  } = useFormContext<TChannelsForm>();
  const channelPath = useChannelPath(index);
  const { fields, append, remove } = useFieldArray({ control, name: `${channelPath}.headers` });
  const headerErrors = getChannelErrors(errors, channelPath)?.headers;

  return (
    <Field>
      <FieldLabel>
        Custom headers <span className="text-muted">(optional)</span>
      </FieldLabel>
      <FieldContent>
        <div className="flex flex-col gap-2">
          {fields.map((field, i) => (
            <div key={field.id} className="flex items-start gap-2">
              <Field className="w-2/5">
                <Input
                  aria-label="Header name"
                  placeholder="X-Env"
                  isError={Boolean(headerErrors?.[i]?.key)}
                  {...register(`${channelPath}.headers.${i}.key`)}
                />
                <FieldError errors={[headerErrors?.[i]?.key]} />
              </Field>
              <Field className="min-w-0 flex-1">
                <Input
                  aria-label="Header value"
                  placeholder="Production"
                  isError={Boolean(headerErrors?.[i]?.value)}
                  {...register(`${channelPath}.headers.${i}.value`)}
                />
                <FieldError errors={[headerErrors?.[i]?.value]} />
              </Field>
              <IconButton aria-label="Remove header" variant="outline" onClick={() => remove(i)}>
                <TrashIcon className="size-4" />
              </IconButton>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="self-start"
            onClick={() => append({ key: "", value: "" })}
          >
            <PlusIcon className="size-3.5" />
            Add Header
          </Button>
        </div>
      </FieldContent>
    </Field>
  );
};

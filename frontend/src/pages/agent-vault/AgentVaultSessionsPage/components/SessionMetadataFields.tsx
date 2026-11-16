import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";

import { SESSION_METADATA_MAX_KEYS, TSessionMetadataRow } from "./sessionMetadataSchema";

type TMetadataFormValues = { metadata: TSessionMetadataRow[] };

type Props = {
  idPrefix: string;
};

export const SessionMetadataFields = ({ idPrefix }: Props) => {
  const {
    control,
    formState: { errors }
  } = useFormContext<TMetadataFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "metadata" });

  const listError = errors.metadata?.root?.message ?? errors.metadata?.message;
  const canAddRow = fields.length < SESSION_METADATA_MAX_KEYS;

  const addRowButton = (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="self-start"
      onClick={() => append({ key: "", value: "" })}
    >
      <PlusIcon />
      Add Metadata
    </Button>
  );

  if (fields.length === 0) return addRowButton;

  return (
    <Field>
      <FieldLabel>
        Metadata <span className="text-muted">(optional)</span>
      </FieldLabel>
      <FieldContent className="gap-2">
        {fields.map((row, index) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2"
          >
            <Controller
              control={control}
              name={`metadata.${index}.key`}
              render={({ field, fieldState }) => (
                <div className="flex min-w-0 flex-col gap-1">
                  <Input
                    {...field}
                    id={`${idPrefix}-metadata-${index}-key`}
                    aria-label={`Metadata key ${index + 1}`}
                    placeholder="runId"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </div>
              )}
            />
            <Controller
              control={control}
              name={`metadata.${index}.value`}
              render={({ field, fieldState }) => (
                <div className="flex min-w-0 flex-col gap-1">
                  <Input
                    {...field}
                    id={`${idPrefix}-metadata-${index}-value`}
                    aria-label={`Metadata value ${index + 1}`}
                    placeholder="8812"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </div>
              )}
            />
            <IconButton
              type="button"
              variant="ghost"
              aria-label={`Remove metadata row ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2Icon />
            </IconButton>
          </div>
        ))}
        {canAddRow && addRowButton}
        <FieldDescription>
          Key and value pairs that say who or what this session is for, such as a run ID or ticket.
        </FieldDescription>
        <FieldError>{listError}</FieldError>
      </FieldContent>
    </Field>
  );
};

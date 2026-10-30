import { Fragment, useId } from "react";
import { Control, Controller, useFieldArray } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldError,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input
} from "@app/components/v3";

export const MetadataForm = ({
  control,
  name = "metadata",
  title = "Metadata",
  isValueRequired = false
}: {
  control: Control<any>;
  name?: string;
  title?: string;
  isValueRequired?: boolean;
}) => {
  const metadataFormFields = useFieldArray({
    control,
    name
  });
  const fieldIdPrefix = useId();

  return (
    <Field className="mt-4">
      {title && <FieldTitle>{title}</FieldTitle>}
      {metadataFormFields.fields.length === 0 ? (
        <Empty className="gap-2 p-6 md:p-6">
          <EmptyHeader>
            <EmptyTitle>No metadata entries</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="xs"
              onClick={() => metadataFormFields.append({ key: "", value: "" })}
            >
              <PlusIcon />
              Add entry
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
            <FieldLabel htmlFor={`${fieldIdPrefix}-key-0`}>Key</FieldLabel>
            <FieldLabel htmlFor={`${fieldIdPrefix}-value-0`} className="col-span-2">
              Value
              {!isValueRequired && <span className="text-muted">(optional)</span>}
            </FieldLabel>
            {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <Fragment key={metadataFieldId}>
                <Controller
                  control={control}
                  name={`${name}.${i}.key`}
                  render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                      <Input
                        {...field}
                        id={`${fieldIdPrefix}-key-${i}`}
                        aria-label={i === 0 ? undefined : "Key"}
                        isError={Boolean(error?.message)}
                      />
                      <FieldError errors={[error]} />
                    </div>
                  )}
                />
                <Controller
                  control={control}
                  name={`${name}.${i}.value`}
                  render={({ field, fieldState: { error } }) => (
                    <div className="flex flex-col gap-1">
                      <Input
                        {...field}
                        id={`${fieldIdPrefix}-value-${i}`}
                        aria-label={i === 0 ? undefined : "Value"}
                        isError={Boolean(error?.message)}
                      />
                      <FieldError errors={[error]} />
                    </div>
                  )}
                />
                <IconButton
                  aria-label="Delete key"
                  variant="outline"
                  onClick={() => metadataFormFields.remove(i)}
                >
                  <TrashIcon />
                </IconButton>
              </Fragment>
            ))}
          </div>
          <div className="pt-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => metadataFormFields.append({ key: "", value: "" })}
            >
              <PlusIcon />
              Add entry
            </Button>
          </div>
        </div>
      )}
    </Field>
  );
};

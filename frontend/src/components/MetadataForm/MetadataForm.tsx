import { Control, Controller, useFieldArray } from "react-hook-form";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
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

  return (
    <Field className="mt-4">
      <FieldLabel>{title}</FieldLabel>
      <FieldContent className="flex flex-col space-y-2 pt-1">
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
          <>
            {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div key={metadataFieldId} className="flex items-start space-x-2">
                <div className="grow">
                  {i === 0 && <FieldLabel className="text-xs text-muted">Key</FieldLabel>}
                  <Controller
                    control={control}
                    name={`${name}.${i}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <Input {...field} className="max-h-8" isError={Boolean(error)} />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                </div>
                <div className="grow">
                  {i === 0 && (
                    <FieldLabel className="text-xs text-muted">
                      Value{" "}
                      {!isValueRequired && (
                        <span className="font-normal text-muted">(optional)</span>
                      )}
                    </FieldLabel>
                  )}
                  <Controller
                    control={control}
                    name={`${name}.${i}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <Input {...field} className="max-h-8" isError={Boolean(error)} />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                </div>
                <IconButton
                  aria-label="delete key"
                  className={`${i === 0 ? "mt-[1.14rem]" : ""} max-h-8`}
                  variant="outline"
                  onClick={() => metadataFormFields.remove(i)}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
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
          </>
        )}
      </FieldContent>
    </Field>
  );
};

import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";

import { TServiceForm } from "./serviceSchema";

export const DescriptionField = ({ placeholder }: { placeholder: string }) => {
  const { control } = useFormContext<TServiceForm>();
  const inputId = useId();

  return (
    <Controller
      control={control}
      name="description"
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel htmlFor={inputId}>
            Description <span className="text-muted">(optional)</span>
          </FieldLabel>
          <FieldContent>
            <Input
              {...field}
              id={inputId}
              placeholder={placeholder}
              isError={Boolean(fieldState.error)}
            />
            <FieldDescription>
              Agents in a session can read this, so never include credentials.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
};

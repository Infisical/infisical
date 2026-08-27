import { Controller, useFormContext } from "react-hook-form";

import { Field, FieldError, FieldFeedback, FieldLabel, Input, TextArea } from "@app/components/v3";

import { TSecretRotationV2Form } from "./schemas";

export const SecretRotationV2DetailsFields = () => {
  const { control } = useFormContext<TSecretRotationV2Form>();

  return (
    <div className="space-y-4">
      <Controller
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="secret-rotation-name">Name</FieldLabel>
            <Input
              ref={ref}
              id="secret-rotation-name"
              autoFocus
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="my-secret-rotation"
              isError={Boolean(error)}
              aria-describedby="secret-rotation-name-feedback"
            />
            <FieldFeedback
              id="secret-rotation-name-feedback"
              description="Must be slug-friendly"
              error={error?.message}
            />
          </Field>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="secret-rotation-description">
              Description <span className="font-normal text-muted">(optional)</span>
            </FieldLabel>
            <TextArea
              ref={ref}
              id="secret-rotation-description"
              value={value ?? ""}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="Describe the purpose of this rotation..."
              className="resize-none"
              rows={4}
              aria-invalid={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="description"
      />
    </div>
  );
};

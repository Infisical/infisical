import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";

import { TSecretScanningDataSourceForm } from "./schemas";

export const SecretScanningDataSourceDetailsFields = () => {
  const { control } = useFormContext<TSecretScanningDataSourceForm>();

  return (
    <>
      <p className="mb-4 text-sm text-label-secondary">
        Provide a name and description for this Data Source.
      </p>
      <Controller
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="secret-scanning-data-source-name">Name</FieldLabel>
            <Input
              {...field}
              id="secret-scanning-data-source-name"
              autoFocus
              placeholder="my-data-source"
              autoComplete="off"
              name="secret-scanning-data-source-name"
              aria-invalid={Boolean(error)}
              aria-describedby={`secret-scanning-data-source-name-help${error ? " secret-scanning-data-source-name-error" : ""}`}
            />
            <FieldDescription id="secret-scanning-data-source-name-help">
              Must be slug-friendly
            </FieldDescription>
            <FieldError id="secret-scanning-data-source-name-error">{error?.message}</FieldError>
          </Field>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="secret-scanning-data-source-description">
              Description <span className="text-muted">(optional)</span>
            </FieldLabel>
            <TextArea
              {...field}
              id="secret-scanning-data-source-description"
              value={field.value ?? ""}
              placeholder="Provide a description for this data source..."
              className="resize-none!"
              rows={4}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "secret-scanning-data-source-description-error" : undefined}
            />
            <FieldError id="secret-scanning-data-source-description-error">
              {error?.message}
            </FieldError>
          </Field>
        )}
        control={control}
        name="description"
      />
    </>
  );
};

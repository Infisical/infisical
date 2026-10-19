import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";

import { TSecretScanningDataSourceForm } from "./schemas";

export const SecretScanningDataSourceDetailsFields = () => {
  const { control } = useFormContext<TSecretScanningDataSourceForm>();

  return (
    <FieldGroup>
      <Controller
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="secret-scanning-data-source-name">Name</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id="secret-scanning-data-source-name"
                autoFocus
                placeholder="acme-org"
                autoComplete="off"
                isError={Boolean(error)}
                aria-describedby="secret-scanning-data-source-name-help"
              />
              <FieldDescription id="secret-scanning-data-source-name-help">
                Shown in the data source list, findings, and audit logs. Must be slug-friendly.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="secret-scanning-data-source-description">
              Description (Optional)
            </FieldLabel>
            <FieldContent>
              <TextArea
                {...field}
                id="secret-scanning-data-source-description"
                value={field.value ?? ""}
                placeholder="Describe what this data source scans..."
                rows={4}
                aria-invalid={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
        control={control}
        name="description"
      />
    </FieldGroup>
  );
};

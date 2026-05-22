import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";

import { TSecretSyncForm } from "./schemas";

export const SecretSyncDetailsFields = () => {
  const { control } = useFormContext<TSecretSyncForm>();

  return (
    <>
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="sync-name">Name</FieldLabel>
            <Input
              id="sync-name"
              value={value ?? ""}
              onChange={onChange}
              placeholder="my-secret-sync"
              isError={Boolean(error)}
              autoFocus
            />
            {!error && <FieldDescription>Must be slug-friendly.</FieldDescription>}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="sync-description">
              Description <span className="text-muted">(optional)</span>
            </FieldLabel>
            <TextArea
              id="sync-description"
              value={value ?? ""}
              onChange={onChange}
              placeholder="Describe the purpose of this sync..."
              isError={Boolean(error)}
              className="resize-none"
              rows={4}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};

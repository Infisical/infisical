import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

export const PkiSyncDetailsFields = () => {
  const { control } = useFormContext<TPkiSyncForm>();

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Provide a name and description for this Certificate Sync.
      </p>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="pki-sync-name">Name</FieldLabel>
            <Input
              id="pki-sync-name"
              value={value}
              onChange={onChange}
              isError={Boolean(error)}
              placeholder="my-certificate-sync"
            />
            <FieldDescription>Must be slug-friendly</FieldDescription>
            <FieldError errors={[error]} />
          </Field>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="pki-sync-description">Description (optional)</FieldLabel>
            <TextArea
              id="pki-sync-description"
              value={value}
              onChange={onChange}
              isError={Boolean(error)}
              placeholder="Describe the purpose of this sync..."
              className="resize-none!"
              rows={4}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
        control={control}
        name="description"
      />
    </>
  );
};

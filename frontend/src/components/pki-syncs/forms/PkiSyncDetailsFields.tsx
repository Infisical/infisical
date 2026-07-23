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
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={value ?? ""}
              onChange={onChange}
              placeholder="my-certificate-sync"
              isError={Boolean(error)}
            />
            {!error?.message && <FieldDescription>Must be slug-friendly.</FieldDescription>}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Description <span className="text-muted">(optional)</span>
            </FieldLabel>
            <TextArea
              value={value ?? ""}
              onChange={onChange}
              placeholder="Describe the purpose of this sync..."
              className="resize-none"
              rows={4}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};

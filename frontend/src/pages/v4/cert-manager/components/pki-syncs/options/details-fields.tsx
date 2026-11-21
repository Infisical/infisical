import { Controller } from "react-hook-form";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { errorOf, usePkiSyncForm } from "../fields";

export function PkiSyncDetailsFields() {
  const { control } = usePkiSyncForm();
  return (
    <Stack gap={16}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field label="Name" description="Must be slug-friendly." error={errorOf(error)}>
            <Input
              ref={field.ref}
              name="pki-sync-name"
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.value)}
              placeholder="my-certificate-sync"
              autoComplete="off"
              invalid={Boolean(error)}
            />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field, fieldState: { error } }) => (
          <Field label="Description" optional error={errorOf(error)}>
            <Textarea
              ref={field.ref}
              name={field.name}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.value)}
              placeholder="Describe the purpose of this sync..."
              rows={4}
              aria-invalid={Boolean(error) || undefined}
            />
          </Field>
        )}
      />
    </Stack>
  );
}

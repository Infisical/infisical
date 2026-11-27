import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { useDraftField } from "../fields";

export function PkiSyncDetailsFields() {
  const name = useDraftField<string | undefined>("name");
  const description = useDraftField<string | undefined>("description");
  return (
    <Stack gap={16}>
      <Field label="Name" description="Must be slug-friendly." error={name.error}>
        <Input
          name="pki-sync-name"
          value={name.value ?? ""}
          onChange={(event) => name.onChange(event.target.value)}
          placeholder="my-certificate-sync"
          autoComplete="off"
          invalid={Boolean(name.error)}
        />
      </Field>
      <Field label="Description" optional error={description.error}>
        <Textarea
          name="description"
          value={description.value ?? ""}
          onChange={(event) => description.onChange(event.target.value)}
          placeholder="Describe the purpose of this sync..."
          rows={4}
          aria-invalid={Boolean(description.error) || undefined}
        />
      </Field>
    </Stack>
  );
}

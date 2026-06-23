import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  Label,
  Switch
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const TriggerDevSyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.TriggerDev }>();

  return (
    <Controller
      name="syncOptions.markAsSecret"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor="trigger-dev-secret">Mark variables as secret</Label>
              <FieldDescription>
                When enabled, synced variables are marked as secret (redacted) environment variables
                in Trigger.dev.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="trigger-dev-secret"
              variant="project"
              checked={value ?? true}
              onCheckedChange={onChange}
            />
          </Field>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};

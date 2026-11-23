import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  Label,
  Toggle
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CoolifySyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Flyio }>();

  return (
    <Controller
      name="syncOptions.autoRedeploy"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor="coolify-auto-redeploy">Auto-redeploy on secret change</Label>
              <FieldDescription>
                Infisical restart the resource after syncing or removing secrets so it&apos;s pick
                up new values immediately.
              </FieldDescription>
            </FieldContent>
            <Toggle
              id="coolify-auto-redeploy"
              variant="project"
              checked={value}
              onCheckedChange={onChange}
            />
          </Field>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};

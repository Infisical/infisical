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

export const FlyioSyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Flyio }>();

  return (
    <Controller
      name="syncOptions.autoRedeploy"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor="flyio-auto-redeploy">Auto-redeploy on secret change</Label>
              <FieldDescription>
                Infisical restarts all app machines after syncing or removing secrets so they pick
                up new values immediately. Fly.io does not expose a way to mark secrets as deployed,
                so the dashboard may still show them as Staged — confirm deployment via the Fly.io
                Machines view or app logs.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="flyio-auto-redeploy"
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

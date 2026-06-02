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

export const RenderSyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Render }>();

  return (
    <Controller
      name="syncOptions.autoRedeployServices"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor="render-auto-redeploy-services">Auto-redeploy services on sync</Label>
              <FieldDescription>
                Services are automatically redeployed when secrets change.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="render-auto-redeploy-services"
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

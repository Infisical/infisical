import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const ConvexSyncFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Convex }>();

  return (
    <>
      <SecretSyncConnectionField />
      <Controller
        name="destinationConfig.deploymentUrl"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Deployment URL"
            helperText="Example: https://your-deployment.convex.cloud"
          >
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://your-deployment.convex.cloud"
            />
          </FormControl>
        )}
      />
    </>
  );
};

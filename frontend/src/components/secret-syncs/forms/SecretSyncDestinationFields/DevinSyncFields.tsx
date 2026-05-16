import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const DevinSyncFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Devin }>();

  return (
    <>
      <SecretSyncConnectionField />
      <Controller
        name="destinationConfig.orgId"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Organization ID"
            tooltipText="The Devin organization ID that secrets should be synced to. You can find this in your Devin organization settings."
          >
            <Input {...field} placeholder="org-..." />
          </FormControl>
        )}
      />
    </>
  );
};

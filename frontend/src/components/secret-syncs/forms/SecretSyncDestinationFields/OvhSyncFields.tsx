import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const OvhSyncFields = () => {
  const { control, setValue } = useFormContext<TSecretSyncForm & { destination: SecretSync.OVH }>();

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.path", "");
        }}
      />
      <Controller
        name="destinationConfig.path"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipClassName="max-w-sm"
            tooltipText="The path in OVH OKMS where secrets will be stored as key/value pairs. If the path does not exist, it will be created."
            isError={Boolean(error)}
            errorText={error?.message}
            label="Path"
          >
            <Input value={value} onChange={onChange} placeholder="app/production" />
          </FormControl>
        )}
      />
    </>
  );
};

import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { AwsRegionSelect } from "./shared";

export const AwsParameterStoreSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSParameterStore }
  >();

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("syncOptions.keyId", undefined);
        }}
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Region">
            <AwsRegionSelect value={value} onChange={onChange} />
          </FormControl>
        )}
        control={control}
        name="destinationConfig.region"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Path">
            <Input value={value} onChange={onChange} placeholder="Path..." />
          </FormControl>
        )}
        control={control}
        name="destinationConfig.path"
      />
    </>
  );
};

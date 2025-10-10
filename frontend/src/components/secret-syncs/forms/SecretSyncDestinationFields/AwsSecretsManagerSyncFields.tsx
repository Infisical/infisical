import { Controller, useFormContext } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

import { TSecretSyncForm } from "../schemas";
import { AwsRegionSelect } from "./shared";

export const AwsSecretsManagerSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const mappingBehavior = watch("destinationConfig.mappingBehavior");

  return (
    <>
      <SecretSyncConnectionField />
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
        name="destinationConfig.mappingBehavior"
        control={control}
        defaultValue={AwsSecretsManagerSyncMappingBehavior.OneToOne}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipClassName="max-w-lg py-3"
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>Specify how Infisical should map secrets to AWS Secrets Manager:</p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  <li>
                    <p className="text-mineshaft-300">
                      <span className="font-medium text-bunker-200">One-To-One</span>: Each
                      Infisical secret will be mapped to a separate AWS Secrets Manager secret.
                    </p>
                  </li>
                  <li>
                    <p className="text-mineshaft-300">
                      <span className="font-medium text-bunker-200">Many-To-One</span>: All
                      Infisical secrets will be mapped to a single AWS Secrets Manager secret.
                    </p>
                  </li>
                </ul>
              </div>
            }
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Mapping Behavior"
          >
            <Select
              value={value}
              onValueChange={(val) => {
                onChange(val);
                setValue("syncOptions.syncSecretMetadataAsTags", false);
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select an option..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(AwsSecretsManagerSyncMappingBehavior).map((behavior) => {
                return (
                  <SelectItem className="capitalize" value={behavior} key={behavior}>
                    {behavior}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      {mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne && (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="AWS Secrets Manager Secret Name"
            >
              <Input value={value} onChange={onChange} placeholder="Secret name..." />
            </FormControl>
          )}
          control={control}
          name="destinationConfig.secretName"
        />
      )}
    </>
  );
};

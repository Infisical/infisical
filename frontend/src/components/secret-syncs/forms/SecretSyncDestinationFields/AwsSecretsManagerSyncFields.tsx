import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <FieldGroup>
      <SecretSyncConnectionField />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Region
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  If the app connection being used has a custom STS endpoint configured, the
                  selected region must match the STS region configured on the app connection.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <AwsRegionSelect value={value} onChange={onChange} />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
        control={control}
        name="destinationConfig.region"
      />
      <Controller
        name="destinationConfig.mappingBehavior"
        control={control}
        defaultValue={AwsSecretsManagerSyncMappingBehavior.OneToOne}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Mapping Behavior
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-lg">
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
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Select
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  setValue("syncOptions.syncSecretMetadataAsTags", false);
                }}
              >
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AwsSecretsManagerSyncMappingBehavior).map((behavior) => (
                    <SelectItem className="capitalize" value={behavior} key={behavior}>
                      {behavior}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne && (
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>AWS Secrets Manager Secret Name</FieldLabel>
              <FieldContent>
                <Input
                  value={value}
                  onChange={onChange}
                  placeholder="Secret name..."
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
          control={control}
          name="destinationConfig.secretName"
        />
      )}
    </FieldGroup>
  );
};

import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Select, SelectItem } from "@app/components/v2";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

export const AwsSecretsManagerPkiSyncFields = () => {
  const { control, setValue } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.AwsSecretsManager }
  >();

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.region", "");
        }}
      />
      <Controller
        name="destinationConfig.region"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="AWS Region"
            tooltipText="Select the AWS region where your secrets will be stored in AWS Secrets Manager."
          >
            <Select
              value={field.value}
              onValueChange={field.onChange}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select an AWS region"
            >
              {AWS_REGIONS.map(({ name, slug }) => (
                <SelectItem value={slug} key={slug}>
                  {name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};

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
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Path"
            tooltipText={
              <>
                The path is required and will be prepended to the key schema. For example, if you
                have a path of{" "}
                <code className="rounded bg-mineshaft-600 px-0.5 py-px text-sm text-mineshaft-300">
                  /demo/path/
                </code>{" "}
                and a key schema of{" "}
                <code className="rounded bg-mineshaft-600 px-0.5 py-px text-sm text-mineshaft-300">
                  INFISICAL_{"{{secretKey}}"}
                </code>
                , then the result will be{" "}
                <code className="rounded bg-mineshaft-600 px-0.5 py-px text-sm text-mineshaft-300">
                  /demo/path/INFISICAL_{"{{secretKey}}"}
                </code>
              </>
            }
            tooltipClassName="max-w-lg"
          >
            <Input value={value} onChange={onChange} placeholder="Path..." />
          </FormControl>
        )}
        control={control}
        name="destinationConfig.path"
      />
    </>
  );
};

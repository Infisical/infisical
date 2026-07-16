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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { AwsRegionSelect } from "./shared";

export const AwsParameterStoreSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSParameterStore }
  >();

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("syncOptions.keyId", undefined);
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.region"
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
      />
      <Controller
        control={control}
        name="destinationConfig.path"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Path
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-lg">
                  The path is required and will be prepended to the key schema. For example, if you
                  have a path of{" "}
                  <code className="rounded-sm bg-mineshaft-600 px-0.5 py-px text-sm text-mineshaft-300">
                    /demo/path/
                  </code>{" "}
                  and a key schema of{" "}
                  <code className="rounded-sm bg-mineshaft-600 px-0.5 py-px text-sm text-mineshaft-300">
                    INFISICAL_{"{{secretKey}}"}
                  </code>
                  , then the result will be{" "}
                  <code className="rounded-sm bg-mineshaft-600 px-0.5 py-px text-sm text-mineshaft-300">
                    /demo/path/INFISICAL_{"{{secretKey}}"}
                  </code>
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input
                value={value}
                onChange={onChange}
                placeholder="Path..."
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};

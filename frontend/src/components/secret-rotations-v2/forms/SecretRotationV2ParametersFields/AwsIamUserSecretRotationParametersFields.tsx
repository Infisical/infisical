import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared";
import {
  Combobox,
  Field,
  FieldError,
  FieldFeedback,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useListAwsConnectionIamUsers } from "@app/hooks/api/appConnections/aws";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const AwsIamUserSecretRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AwsIamUserSecret;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: clients, isPending: isClientsPending } = useListAwsConnectionIamUsers({
    connectionId
  });

  return (
    <>
      <Controller
        name="parameters.userName"
        control={control}
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip htmlFor="aws-iam-user">IAM User</FieldLabelWithTooltip>
            <Combobox
              id="aws-iam-user"
              isLoading={isClientsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={clients?.find((client) => client.UserName === value) ?? null}
              onBlur={onBlur}
              onValueChange={(option) => onChange(option.UserName)}
              isClearable={false}
              options={clients}
              placeholder="Select an IAM user..."
              getOptionLabel={(option) => option.UserName}
              getOptionValue={(option) => option.UserName}
              isError={Boolean(error)}
              aria-describedby="aws-iam-user-feedback"
            />
            <FieldFeedback
              id="aws-iam-user-feedback"
              description={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex items-center gap-1 text-left">
                      <span>Don&#39;t see the IAM user you&#39;re looking for?</span>
                      <InfoIcon className="size-3 shrink-0 text-muted" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    Ensure that your connection has the correct permissions.
                  </TooltipContent>
                </Tooltip>
              }
              error={error?.message}
            />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="parameters.region"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              id="aws-region-label"
              htmlFor="aws-region"
              tooltip="Required only if no global scope is set."
            >
              Region <span className="font-normal text-muted">(optional)</span>
            </FieldLabelWithTooltip>
            <AwsRegionSelect
              id="aws-region"
              value={value ?? ""}
              onChange={onChange}
              isError={Boolean(error)}
              aria-labelledby="aws-region-label"
              aria-describedby={error ? "aws-region-error" : undefined}
            />
            <FieldError id="aws-region-error">{error?.message}</FieldError>
          </Field>
        )}
      />
    </>
  );
};

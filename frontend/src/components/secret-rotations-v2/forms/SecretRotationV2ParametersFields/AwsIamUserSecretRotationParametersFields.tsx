import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { InfoIcon } from "lucide-react";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared";
import {
  Field,
  FieldError,
  FieldFeedback,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAwsIamUserSecret, useListAwsConnectionIamUsers } from "@app/hooks/api/appConnections/aws";
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
            <FilterableSelect
              inputId="aws-iam-user"
              isLoading={isClientsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={clients?.find((client) => client.UserName === value) ?? ""}
              onBlur={onBlur}
              onChange={(option) => {
                onChange((option as SingleValue<TAwsIamUserSecret>)?.UserName ?? "");
              }}
              options={clients}
              placeholder="Select an IAM user..."
              getOptionLabel={(option) =>
                (option as SingleValue<TAwsIamUserSecret>)?.UserName ?? ""
              }
              getOptionValue={(option) =>
                (option as SingleValue<TAwsIamUserSecret>)?.UserName ?? ""
              }
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
              htmlFor="aws-region"
              tooltip="Required only if no global scope is set."
            >
              Region <span className="font-normal text-muted">(optional)</span>
            </FieldLabelWithTooltip>
            <AwsRegionSelect value={value ?? ""} onChange={onChange} isError={Boolean(error)} />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
    </>
  );
};

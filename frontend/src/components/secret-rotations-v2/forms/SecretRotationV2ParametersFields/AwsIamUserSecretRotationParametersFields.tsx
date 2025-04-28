import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
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
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="IAM User"
            helperText={
              <Tooltip
                className="max-w-md"
                content={<>Ensure that your connection has the correct permissions.</>}
              >
                <div>
                  <span>Don&#39;t see the IAM user you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isClientsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={clients?.find((client) => client.UserName === value) ?? ""}
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
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="parameters.region"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isOptional
            isError={Boolean(error)}
            errorText={error?.message}
            label="Region"
            tooltipText="Required only if no global scope is set."
          >
            <AwsRegionSelect value={value ?? ""} onChange={onChange} />
          </FormControl>
        )}
      />
    </>
  );
};

import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Tooltip } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import { useSnowflakeConnectionListUsers } from "@app/hooks/api/appConnections/snowflake";
import { TSnowflakeUser } from "@app/hooks/api/appConnections/snowflake/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const SnowflakeUserKeyPairRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SnowflakeUserKeyPair;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: users, isPending: isUsersPending } = useSnowflakeConnectionListUsers(connectionId, {
    enabled: Boolean(connectionId)
  });

  return (
    <Controller
      name="parameters.username"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="User"
          helperText={
            <Tooltip
              className="max-w-md"
              content={
                <>
                  Select an existing Snowflake user, or type a new username to create it. New users
                  are created as key-pair-only SERVICE users. Ensure your connection&#39;s role has
                  the privileges to list users, alter the user&#39;s RSA public key, and (for new
                  users) create users. If the keys are rotated the user will continue to exist.
                </>
              }
            >
              <div>
                <span>Don&#39;t see the user you&#39;re looking for?</span>{" "}
                <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
              </div>
            </Tooltip>
          }
        >
          <CreatableSelect
            menuPlacement="top"
            isLoading={isUsersPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={users?.find((user) => user.name === value) ?? (value ? { name: value } : null)}
            onChange={(option) => {
              const selectedUser = option as SingleValue<TSnowflakeUser>;
              onChange(selectedUser?.name ?? null);
            }}
            onCreateOption={(inputValue) => onChange(inputValue)}
            getNewOptionData={(inputValue) => ({ name: inputValue })}
            isValidNewOption={(inputValue) => inputValue.trim().length > 0}
            options={users}
            placeholder="Select or enter a user..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.name}
          />
        </FormControl>
      )}
    />
  );
};

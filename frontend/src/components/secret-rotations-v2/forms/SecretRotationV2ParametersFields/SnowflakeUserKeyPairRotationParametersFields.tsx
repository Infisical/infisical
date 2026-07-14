import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FilterableSelect, FormControl, Tooltip } from "@app/components/v2";
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
                  Ensure that your connection&#39;s role has the necessary privileges to list users
                  and to alter the selected user&#39;s RSA public key.
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
          <FilterableSelect
            menuPlacement="top"
            isLoading={isUsersPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={users?.find((user) => user.name === value) ?? null}
            onChange={(option) => {
              const selectedUser = option as SingleValue<TSnowflakeUser>;
              onChange(selectedUser?.name ?? null);
            }}
            options={users}
            placeholder="Select a user..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.name}
          />
        </FormControl>
      )}
    />
  );
};

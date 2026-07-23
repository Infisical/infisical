import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import { useSnowflakeConnectionListUsers } from "@app/hooks/api/appConnections/snowflake";
import { TSnowflakeUser } from "@app/hooks/api/appConnections/snowflake/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

// The create-option row shows its own label ("Add user ...") while the form value stays the raw username.
type TUserOption = TSnowflakeUser & { label?: string };

const RSA_MODULUS_LENGTHS = [2048, 4096] as const;

export const SnowflakeUserKeyPairRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SnowflakeUserKeyPair;
    }
  >();

  const connectionId = watch("connection.id");
  const isUpdate = Boolean(watch("id"));

  const { data: users, isPending: isUsersPending } = useSnowflakeConnectionListUsers(connectionId, {
    enabled: Boolean(connectionId) && !isUpdate
  });

  return (
    <>
      <Controller
        name="parameters.username"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="User"
            helperText={
              isUpdate ? (
                "Cannot be updated."
              ) : (
                <Tooltip
                  className="max-w-md"
                  content={
                    <>
                      Select an existing Snowflake user, or type a new username to create it. New
                      users are created as key-pair-only SERVICE users. Ensure your connection&#39;s
                      role has the privileges to list users, alter the user&#39;s RSA public key,
                      and (for new users) create users. If the keys are rotated the user will
                      continue to exist.
                    </>
                  }
                >
                  <div>
                    <span>Don&#39;t see the user you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              )
            }
          >
            <CreatableSelect<TUserOption>
              menuPlacement="top"
              isLoading={isUsersPending && Boolean(connectionId) && !isUpdate}
              isDisabled={!connectionId || isUpdate}
              value={users?.find((user) => user.name === value) ?? (value ? { name: value } : null)}
              onChange={(option) => {
                const selectedUser = option as SingleValue<TUserOption>;
                onChange(selectedUser?.name ?? null);
              }}
              onCreateOption={(inputValue) => onChange(inputValue)}
              getNewOptionData={(inputValue) => ({
                name: inputValue,
                label: `Add user "${inputValue}"`
              })}
              isValidNewOption={(inputValue) => inputValue.trim().length > 0}
              options={users}
              placeholder="Select or add a new user..."
              getOptionLabel={(option) => option.label ?? option.name}
              getOptionValue={(option) => option.name}
              isClearable
            />
          </FormControl>
        )}
      />
      <Controller
        name="parameters.modulusLength"
        control={control}
        defaultValue={2048}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="RSA Modulus Length"
            tooltipText="The size in bits of the generated RSA key pairs. 2048-bit keys are faster to generate and use; 4096-bit keys provide a larger security margin."
            tooltipClassName="max-w-sm"
          >
            <Select
              value={String(value)}
              onValueChange={(val) => onChange(Number(val))}
              className="w-full border border-mineshaft-500"
              position="popper"
              dropdownContainerClassName="max-w-none"
            >
              {RSA_MODULUS_LENGTHS.map((length) => (
                <SelectItem value={String(length)} key={length}>
                  {length}-bit
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};

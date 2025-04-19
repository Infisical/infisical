import { Controller, useFormContext } from "react-hook-form";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { DEFAULT_PASSWORD_REQUIREMENTS } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { FormControl, Input, Tooltip } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const LdapPasswordRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.LdapPassword;
    }
  >();

  return (
    <>
      <Controller
        name="parameters.dn"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Distinguished Name (DN)"
            helperText={
              <Tooltip
                className="max-w-md"
                content={
                  <>
                    Ensure that your connection has the{" "}
                    <span className="font-semibold">read_clients</span> permission and the
                    application exists in the connection&#39;s audience.
                  </>
                }
              >
                <div>
                  <span>Don&#39;t see the application you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            {/* <FilterableSelect
            menuPlacement="top"
            isLoading={isClientsPending && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={clients?.find((client) => client.id === value) ?? null}
            onChange={(option) => {
              onChange((option as SingleValue<TAuth0Client>)?.id ?? null);
            }}
            options={clients}
            placeholder="Select an application..."
            getOptionLabel={(option) => option.name}
            getOptionValue={(option) => option.id}
          /> */}
            <Input
              value={value}
              onChange={onChange}
              placeholder="CN=John,OU=Users,DC=example,DC=com"
            />
          </FormControl>
        )}
      />
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Password Requirements</span>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded border border-mineshaft-600 bg-mineshaft-700 px-3 py-2">
          <Controller
            control={control}
            name="parameters.passwordRequirements.length"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.length}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Passsword Length"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="The length of the password to generate"
              >
                <Input
                  type="number"
                  min={1}
                  max={250}
                  size="sm"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.digits"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.digits}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Digit Count"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Minimum number of digits"
              >
                <Input
                  type="number"
                  min={0}
                  size="sm"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.lowercase"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.lowercase}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Lowercase Character Count"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Minimum number of lowercase characters"
              >
                <Input
                  type="number"
                  min={0}
                  size="sm"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.uppercase"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.uppercase}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Uppercase Character Count"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Minimum number of uppercase characters"
              >
                <Input
                  type="number"
                  min={0}
                  size="sm"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.symbols"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.symbols}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Symbol Count"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Minimum number of symbols"
              >
                <Input
                  type="number"
                  min={0}
                  size="sm"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.allowedSymbols"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.allowedSymbols}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Symbols"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Symbols to use in generated password"
              >
                <Input
                  placeholder="-_.~!*"
                  size="sm"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
            )}
          />
        </div>
      </div>
    </>
  );
};

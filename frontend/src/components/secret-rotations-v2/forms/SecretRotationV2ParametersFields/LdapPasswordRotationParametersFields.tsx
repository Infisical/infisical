import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { DEFAULT_PASSWORD_REQUIREMENTS } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { LdapPasswordRotationMethod } from "@app/hooks/api/secretRotationsV2/types/ldap-password-rotation";

export const LdapPasswordRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.LdapPassword;
    }
  >();

  const [id, rotationMethod] = watch(["id", "parameters.rotationMethod"]);
  const isUpdate = Boolean(id);

  return (
    <>
      <Controller
        name="parameters.rotationMethod"
        control={control}
        defaultValue={LdapPasswordRotationMethod.ConnectionPrincipal}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText={
              <>
                <span>Determines how the rotation will be performed:</span>
                <ul className="ml-4 mt-2 flex list-disc flex-col gap-2">
                  <li>
                    <span className="font-medium">Connection Principal</span> - The Connection
                    principal will rotate the target principal&#39;s password.
                  </li>
                  <li>
                    <span className="font-medium">Target Principal</span> - The target principal
                    will rotate their own password.
                  </li>
                </ul>
              </>
            }
            tooltipClassName="max-w-sm"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Rotation Method"
            helperText={
              // eslint-disable-next-line no-nested-ternary
              isUpdate
                ? "Cannot be updated."
                : value === LdapPasswordRotationMethod.ConnectionPrincipal
                  ? "The connection principal will rotate the target principal's password"
                  : "The target principal will rotate their own password"
            }
          >
            <Select
              isDisabled={isUpdate}
              value={value}
              onValueChange={(val) => {
                setValue(
                  "temporaryParameters",
                  val === LdapPasswordRotationMethod.TargetPrincipal
                    ? {
                        password: ""
                      }
                    : undefined
                );
                onChange(val);
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(LdapPasswordRotationMethod).map((method) => {
                return (
                  <SelectItem value={method} className="capitalize" key={method}>
                    {method.replace("-", " ")}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      <div className="flex gap-3">
        <Controller
          name="parameters.dn"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              className="flex-1"
              isError={Boolean(error)}
              errorText={error?.message}
              label="Target Principal's DN/UPN"
              tooltipText="The DN/UPN of the principal that you want to perform password rotation on."
              tooltipClassName="max-w-sm"
              helperText={isUpdate ? "Cannot be updated." : undefined}
            >
              <Input
                isDisabled={isUpdate}
                value={value}
                onChange={onChange}
                placeholder="CN=John,OU=Users,DC=example,DC=com"
              />
            </FormControl>
          )}
        />
        {rotationMethod === LdapPasswordRotationMethod.TargetPrincipal && !isUpdate && (
          <Controller
            name="temporaryParameters.password"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                className="flex-1"
                isError={Boolean(error)}
                errorText={error?.message}
                label="Target Principal's Password"
              >
                <Input
                  value={value}
                  onChange={onChange}
                  type="password"
                  placeholder="****************"
                />
              </FormControl>
            )}
          />
        )}
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Password Requirements</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded border border-mineshaft-600 bg-mineshaft-700 px-3 pt-3">
          <Controller
            control={control}
            name="parameters.passwordRequirements.length"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.length}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Password Length"
                isError={Boolean(error)}
                errorText={error?.message}
                tooltipText="The length of the password to generate"
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
                tooltipText="Minimum number of digits"
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
                tooltipText="Minimum number of lowercase characters"
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
                tooltipText="Minimum number of uppercase characters"
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
                tooltipText="Minimum number of symbols"
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
                tooltipText="Symbols to use in generated password"
              >
                <Input
                  placeholder="-_.~!*"
                  size="sm"
                  {...field}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
            )}
          />
        </div>
      </div>
    </>
  );
};

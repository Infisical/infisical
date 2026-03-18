import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { HpIloRotationMethod } from "@app/hooks/api/secretRotationsV2/types/hp-ilo-rotation";

// iLO 5 has a maximum password length of 39 characters
const HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS = {
  length: 39,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  }
};

const getRotationMethodHelperText = (
  isUpdate: boolean,
  value?: HpIloRotationMethod
): string | undefined => {
  if (isUpdate) return "Cannot be updated.";
  if (value === HpIloRotationMethod.LoginAsRoot) {
    return "The SSH connection credentials will change the target user's password";
  }
  return "The target user will change their own password";
};

export const HpIloRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.HpIloLocalAccount;
    }
  >();

  const id = watch("id");
  const rotationMethod = watch("parameters.rotationMethod", HpIloRotationMethod.LoginAsTarget);
  const isUpdate = Boolean(id);

  return (
    <>
      <Controller
        name="parameters.rotationMethod"
        control={control}
        defaultValue={HpIloRotationMethod.LoginAsTarget}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText={
              <>
                <span>Determines how the rotation will be performed:</span>
                <ul className="mt-2 ml-4 flex list-disc flex-col gap-2">
                  <li>
                    <span className="font-medium">Login as Root</span> - The SSH connection
                    credentials of the app connection linked will be used to change the target
                    user&apos;s password.
                  </li>
                  <li>
                    <span className="font-medium">Login as Target</span> - The target user will
                    authenticate with their own credentials and change their own password.
                  </li>
                </ul>
              </>
            }
            tooltipClassName="max-w-sm"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Rotation Method"
            helperText={getRotationMethodHelperText(isUpdate, value)}
          >
            <Select
              isDisabled={isUpdate}
              value={value}
              onValueChange={(val) => {
                setValue("temporaryParameters", {
                  password: ""
                });
                onChange(val);
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(HpIloRotationMethod).map((method) => {
                return (
                  <SelectItem value={method} className="capitalize" key={method}>
                    {method.replace(/-/g, " ")}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      <div className="flex gap-3">
        <Controller
          name="parameters.username"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              className="flex-1"
              isError={Boolean(error)}
              errorText={error?.message}
              label="Target Username"
              tooltipText="The HP iLO username of the account to rotate the password for."
              tooltipClassName="max-w-sm"
              helperText={isUpdate ? "Cannot be updated." : undefined}
            >
              <Input
                isDisabled={isUpdate}
                value={value}
                onChange={onChange}
                placeholder="ilo_user"
              />
            </FormControl>
          )}
        />
        {!isUpdate && rotationMethod === HpIloRotationMethod.LoginAsTarget && (
          <Controller
            name="temporaryParameters.password"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                className="flex-1"
                isError={Boolean(error)}
                errorText={error?.message}
                label="Current Password"
                tooltipText="The current password of the target user. Required for initial rotation setup."
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
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-sm border border-mineshaft-600 bg-mineshaft-700 px-3 pt-3">
          <Controller
            control={control}
            name="parameters.passwordRequirements.length"
            defaultValue={HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS.length}
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
            defaultValue={HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS.required.digits}
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
            defaultValue={HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS.required.lowercase}
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
            defaultValue={HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS.required.uppercase}
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
            defaultValue={HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS.required.symbols}
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

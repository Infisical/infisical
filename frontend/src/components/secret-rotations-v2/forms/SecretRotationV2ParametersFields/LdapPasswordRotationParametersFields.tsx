import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { DEFAULT_PASSWORD_REQUIREMENTS } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { FormControl, Input } from "@app/components/v2";
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
          >
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
                label="Password Length"
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

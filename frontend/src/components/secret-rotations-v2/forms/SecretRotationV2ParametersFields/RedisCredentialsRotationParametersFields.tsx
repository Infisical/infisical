import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { DEFAULT_PASSWORD_REQUIREMENTS } from "../schemas/shared";

export const RedisCredentialsRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.RedisCredentials;
    }
  >();

  return (
    <>
      <div>
        <Controller
          control={control}
          name="parameters.permissionScope"
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl
              tooltipClassName="max-w-[40rem] w-full"
              tooltipText={
                <div className="flex flex-col gap-4">
                  <p>
                    This is the access control permissions that will be set for the issued Redis
                    users. The format must be a valid Redis ACL pattern.
                  </p>
                  <p>
                    The default value is{" "}
                    <code className="rounded bg-mineshaft-700 px-1 py-0.5 font-mono font-medium text-bunker-300">
                      ~* +@all
                    </code>
                    . You can modify it to suit your needs.
                  </p>
                  <p>
                    For more information, please refer to the{" "}
                    <a
                      className="font-medium text-primary-500 underline hover:text-primary-600"
                      href="https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Redis ACL documentation
                    </a>
                    .
                  </p>
                </div>
              }
              label="Permission Scope"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="~* +@read @write" />
            </FormControl>
          )}
        />
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

import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, Input } from "@app/components/v3";
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
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip
                htmlFor="redis-permission-scope"
                tooltipClassName="max-w-160 w-full"
                tooltip={
                  <div className="flex flex-col gap-4">
                    <p>
                      This is the access control permissions that will be set for the issued Redis
                      users. The format must be a valid Redis ACL pattern.
                    </p>
                    <p>
                      The default value is{" "}
                      <code className="rounded-sm bg-container px-1 py-0.5 font-mono font-medium text-foreground">
                        ~* +@all
                      </code>
                      . You can modify it to suit your needs.
                    </p>
                    <p>
                      For more information, please refer to the{" "}
                      <a
                        className="font-medium underline"
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
              >
                Permission Scope
              </FieldLabelWithTooltip>
              <Input
                ref={ref}
                id="redis-permission-scope"
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder="~* +@read @write"
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-label">Password Requirements</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-sm border border-border bg-card px-3 pt-3">
          <Controller
            control={control}
            name="parameters.passwordRequirements.length"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.length}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip tooltip="The length of the password to generate">
                  Password Length
                </FieldLabelWithTooltip>
                <Input
                  type="number"
                  min={1}
                  max={250}
                  {...field}
                  isError={Boolean(error)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.digits"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.digits}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip tooltip="Minimum number of digits">
                  Digit Count
                </FieldLabelWithTooltip>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  isError={Boolean(error)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.lowercase"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.lowercase}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip tooltip="Minimum number of lowercase characters">
                  Lowercase Character Count
                </FieldLabelWithTooltip>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  isError={Boolean(error)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.uppercase"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.uppercase}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip tooltip="Minimum number of uppercase characters">
                  Uppercase Character Count
                </FieldLabelWithTooltip>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  isError={Boolean(error)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.required.symbols"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.required.symbols}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip tooltip="Minimum number of symbols">
                  Symbol Count
                </FieldLabelWithTooltip>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  isError={Boolean(error)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="parameters.passwordRequirements.allowedSymbols"
            defaultValue={DEFAULT_PASSWORD_REQUIREMENTS.allowedSymbols}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip tooltip="Symbols to use in generated password">
                  Allowed Symbols
                </FieldLabelWithTooltip>
                <Input
                  placeholder="-_.~!*"
                  {...field}
                  isError={Boolean(error)}
                  onChange={(e) => field.onChange(e.target.value)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        </div>
      </div>
    </>
  );
};

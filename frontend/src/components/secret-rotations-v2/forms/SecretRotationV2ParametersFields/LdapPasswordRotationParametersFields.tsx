import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { DEFAULT_PASSWORD_REQUIREMENTS } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Field,
  FieldError,
  FieldFeedback,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              tooltip={
                <>
                  <span>Determines how the rotation will be performed:</span>
                  <ul className="mt-2 ml-4 flex list-disc flex-col gap-2">
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
            >
              Rotation Method
            </FieldLabelWithTooltip>
            <Select
              disabled={isUpdate}
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
            >
              <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-none">
                {Object.values(LdapPasswordRotationMethod).map((method) => (
                  <SelectItem value={method} className="capitalize" key={method}>
                    {method.replace("-", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldFeedback
              id="ldap-rotation-method-feedback"
              description={
                <>
                  {isUpdate && "Cannot be updated."}
                  {!isUpdate &&
                    value === LdapPasswordRotationMethod.ConnectionPrincipal &&
                    "The connection principal will rotate the target principal's password"}
                  {!isUpdate &&
                    value !== LdapPasswordRotationMethod.ConnectionPrincipal &&
                    "The target principal will rotate their own password"}
                </>
              }
              error={error?.message}
            />
          </Field>
        )}
      />
      <div className="flex gap-3">
        <Controller
          name="parameters.dn"
          control={control}
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field className="flex-1" data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip
                htmlFor="ldap-target-dn"
                tooltip="The DN/UPN of the principal that you want to perform password rotation on."
                tooltipClassName="max-w-sm"
              >
                Target Principal&apos;s DN/UPN
              </FieldLabelWithTooltip>
              <Input
                ref={ref}
                id="ldap-target-dn"
                disabled={isUpdate}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder="CN=John,OU=Users,DC=example,DC=com"
                isError={Boolean(error)}
                aria-describedby={
                  isUpdate || error?.message ? "ldap-target-dn-feedback" : undefined
                }
              />
              {(isUpdate || error?.message) && (
                <FieldFeedback
                  id="ldap-target-dn-feedback"
                  description={isUpdate ? "Cannot be updated." : undefined}
                  error={error?.message}
                />
              )}
            </Field>
          )}
        />
        {rotationMethod === LdapPasswordRotationMethod.TargetPrincipal && !isUpdate && (
          <Controller
            name="temporaryParameters.password"
            control={control}
            render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
              <Field className="flex-1" data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip htmlFor="ldap-target-password">
                  Target Principal&apos;s Password
                </FieldLabelWithTooltip>
                <Input
                  ref={ref}
                  id="ldap-target-password"
                  value={value}
                  onBlur={onBlur}
                  onChange={onChange}
                  type="password"
                  placeholder="****************"
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        )}
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

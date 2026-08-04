import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { DEFAULT_PASSWORD_REQUIREMENTS } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Checkbox,
  Field,
  FieldContent,
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
import { UnixLinuxLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";

export const UnixLinuxLocalAccountRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.UnixLinuxLocalAccount;
    }
  >();

  const id = watch("id");
  const rotationMethod = watch(
    "parameters.rotationMethod",
    UnixLinuxLocalAccountRotationMethod.LoginAsTarget
  );
  const isUpdate = Boolean(id);

  return (
    <>
      <Controller
        name="parameters.rotationMethod"
        control={control}
        defaultValue={UnixLinuxLocalAccountRotationMethod.LoginAsTarget}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              tooltip={
                <>
                  <span>Determines how the rotation will be performed:</span>
                  <ul className="mt-2 ml-4 flex list-disc flex-col gap-2">
                    <li>
                      <span className="font-medium">Login as Root</span> - The SSH connection
                      credentials of the app connection linked will be used to change the target
                      user&#39;s password.
                    </li>
                    <li>
                      <span className="font-medium">Login as Target</span> - The target user will
                      authenticate with their own credentials and change their own password.
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
                setValue("temporaryParameters", {
                  password: ""
                });
                onChange(val);
              }}
            >
              <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-none">
                {Object.values(UnixLinuxLocalAccountRotationMethod).map((method) => (
                  <SelectItem value={method} className="capitalize" key={method}>
                    {method.replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldFeedback
              id="unix-linux-rotation-method-feedback"
              description={
                <>
                  {isUpdate && "Cannot be updated."}
                  {!isUpdate &&
                    value === UnixLinuxLocalAccountRotationMethod.LoginAsRoot &&
                    "The SSH connection credentials will change the target user's password"}
                  {!isUpdate &&
                    value !== UnixLinuxLocalAccountRotationMethod.LoginAsRoot &&
                    "The target user will change their own password"}
                </>
              }
              error={error?.message}
            />
          </Field>
        )}
      />
      {rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsRoot && (
        <Controller
          name="parameters.useSudo"
          control={control}
          defaultValue
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field orientation="horizontal" data-invalid={Boolean(error)}>
              <Checkbox
                id="useSudo"
                isChecked={value}
                onCheckedChange={(checked) => onChange(checked)}
              />
              <FieldContent>
                <FieldLabelWithTooltip
                  htmlFor="useSudo"
                  tooltip="When enabled, uses 'sudo passwd' to change the password. When disabled, uses 'passwd' directly. Enable this if the SSH connection user requires sudo privileges to change other users' passwords. If sudo prompts for a password, the app connection password will be provided automatically."
                  tooltipClassName="max-w-sm"
                >
                  Use sudo to change password
                </FieldLabelWithTooltip>
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      )}
      <div className="flex gap-3">
        <Controller
          name="parameters.username"
          control={control}
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field className="flex-1" data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip
                htmlFor="unix-linux-target-username"
                tooltip="The Unix/Linux username of the account to rotate the password for."
                tooltipClassName="max-w-sm"
              >
                Target Username
              </FieldLabelWithTooltip>
              <Input
                ref={ref}
                id="unix-linux-target-username"
                disabled={isUpdate}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder="appuser"
                isError={Boolean(error)}
                aria-describedby={
                  isUpdate || error?.message ? "unix-linux-target-username-feedback" : undefined
                }
              />
              {(isUpdate || error?.message) && (
                <FieldFeedback
                  id="unix-linux-target-username-feedback"
                  description={isUpdate ? "Cannot be updated." : undefined}
                  error={error?.message}
                />
              )}
            </Field>
          )}
        />
        {!isUpdate && rotationMethod === UnixLinuxLocalAccountRotationMethod.LoginAsTarget && (
          <Controller
            name="temporaryParameters.password"
            control={control}
            render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
              <Field className="flex-1" data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip
                  htmlFor="unix-linux-current-password"
                  tooltip="The current password of the target user. Required for initial rotation setup."
                >
                  Current Password
                </FieldLabelWithTooltip>
                <Input
                  ref={ref}
                  id="unix-linux-current-password"
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

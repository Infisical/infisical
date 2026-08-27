import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { ValidationRuleOverrideNotice } from "@app/components/secret-validation/ValidationRuleOverrideNotice";
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
import {
  SecretRotationRuleProvider,
  SecretValidationRuleType
} from "@app/hooks/api/secretValidationRules";

import { PasswordRequirementsFields } from "./shared";

export const UnixLinuxLocalAccountRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.UnixLinuxLocalAccount;
    }
  >();

  const id = watch("id");
  const environmentSlug = watch("environment")?.slug;
  const secretPath = watch("secretPath");
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
      <ValidationRuleOverrideNotice
        type={SecretValidationRuleType.SecretRotations}
        provider={SecretRotationRuleProvider.UnixLinuxLocalAccount}
        environmentSlug={environmentSlug}
        secretPath={secretPath}
      />
      <PasswordRequirementsFields />
    </>
  );
};

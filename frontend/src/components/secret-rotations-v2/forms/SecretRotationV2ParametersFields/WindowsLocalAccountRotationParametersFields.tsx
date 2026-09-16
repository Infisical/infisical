import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
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
import { WindowsLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

import { PasswordRequirementsFields } from "./shared";

export const WindowsLocalAccountRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.WindowsLocalAccount;
    }
  >();

  const id = watch("id");
  const rotationMethod = watch(
    "parameters.rotationMethod",
    WindowsLocalAccountRotationMethod.LoginAsTarget
  );
  const isUpdate = Boolean(id);

  return (
    <>
      <Controller
        name="parameters.rotationMethod"
        control={control}
        defaultValue={WindowsLocalAccountRotationMethod.LoginAsTarget}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              tooltip={
                <>
                  <span>Determines how the rotation will be performed:</span>
                  <ul className="mt-2 ml-4 flex list-disc flex-col gap-2">
                    <li>
                      <span className="font-medium">Login as Root</span> - The SMB connection
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
                {Object.values(WindowsLocalAccountRotationMethod).map((method) => (
                  <SelectItem value={method} className="capitalize" key={method}>
                    {method.replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldFeedback
              id="windows-rotation-method-feedback"
              description={
                <>
                  {isUpdate && "Cannot be updated."}
                  {!isUpdate &&
                    value === WindowsLocalAccountRotationMethod.LoginAsRoot &&
                    "The SMB connection credentials will change the target user's password"}
                  {!isUpdate &&
                    value !== WindowsLocalAccountRotationMethod.LoginAsRoot &&
                    "The target user will change their own password"}
                </>
              }
              error={error?.message}
            />
          </Field>
        )}
      />
      <div className="flex gap-3">
        <Controller
          name="parameters.username"
          control={control}
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field className="flex-1" data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip
                htmlFor="windows-target-username"
                tooltip="The Windows username of the account to rotate the password for."
                tooltipClassName="max-w-sm"
              >
                Target Username
              </FieldLabelWithTooltip>
              <Input
                ref={ref}
                id="windows-target-username"
                disabled={isUpdate}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder="appuser"
                isError={Boolean(error)}
                aria-describedby={
                  isUpdate || error?.message ? "windows-target-username-feedback" : undefined
                }
              />
              {(isUpdate || error?.message) && (
                <FieldFeedback
                  id="windows-target-username-feedback"
                  description={isUpdate ? "Cannot be updated." : undefined}
                  error={error?.message}
                />
              )}
            </Field>
          )}
        />
        {!isUpdate && rotationMethod === WindowsLocalAccountRotationMethod.LoginAsTarget && (
          <Controller
            name="temporaryParameters.password"
            control={control}
            render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
              <Field className="flex-1" data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip
                  htmlFor="windows-current-password"
                  tooltip="The current password of the target user. Required for initial rotation setup."
                >
                  Current Password
                </FieldLabelWithTooltip>
                <Input
                  ref={ref}
                  id="windows-current-password"
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
      <PasswordRequirementsFields />
    </>
  );
};

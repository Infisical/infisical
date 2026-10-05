import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Toggle
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { HpIloRotationMethod } from "@app/hooks/api/secretRotationsV2/types/hp-ilo-rotation";

import { HP_ILO_MAX_PASSWORD_LENGTH } from "../schemas/hp-ilo-rotation-schema";
import { PasswordRequirementsFields } from "./shared";

const HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS = {
  length: HP_ILO_MAX_PASSWORD_LENGTH,
  required: {
    lowercase: 1,
    uppercase: 1,
    digits: 1,
    symbols: 0
  }
};

enum ParameterTab {
  PasswordRequirements = "password-requirements",
  Ssl = "ssl"
}

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
  const rotationMethod = watch("parameters.rotationMethod", HpIloRotationMethod.LoginAsRoot);
  const isUpdate = Boolean(id);
  const scopeVariant = useScopeVariant();

  return (
    <>
      <Controller
        name="parameters.rotationMethod"
        control={control}
        defaultValue={HpIloRotationMethod.LoginAsRoot}
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
                {Object.values(HpIloRotationMethod).map((method) => (
                  <SelectItem value={method} className="capitalize" key={method}>
                    {method.replace(/-/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldFeedback
              id="hp-ilo-rotation-method-feedback"
              description={getRotationMethodHelperText(isUpdate, value)}
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
                htmlFor="hp-ilo-target-username"
                tooltip="The HP iLO username of the account to rotate the password for."
                tooltipClassName="max-w-sm"
              >
                Target Username
              </FieldLabelWithTooltip>
              <Input
                ref={ref}
                id="hp-ilo-target-username"
                disabled={isUpdate}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder="ilo_user"
                isError={Boolean(error)}
                aria-describedby={
                  isUpdate || error?.message ? "hp-ilo-target-username-feedback" : undefined
                }
              />
              {(isUpdate || error?.message) && (
                <FieldFeedback
                  id="hp-ilo-target-username-feedback"
                  description={isUpdate ? "Cannot be updated." : undefined}
                  error={error?.message}
                />
              )}
            </Field>
          )}
        />
        {!isUpdate && rotationMethod === HpIloRotationMethod.LoginAsTarget && (
          <Controller
            name="temporaryParameters.password"
            control={control}
            render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
              <Field className="flex-1" data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip
                  htmlFor="hp-ilo-current-password"
                  tooltip="The current password of the target user. Required for initial rotation setup."
                >
                  Current Password
                </FieldLabelWithTooltip>
                <Input
                  ref={ref}
                  id="hp-ilo-current-password"
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
      <Tabs defaultValue={ParameterTab.PasswordRequirements}>
        <TabsList variant="project" className="w-full justify-start">
          <TabsTrigger value={ParameterTab.PasswordRequirements}>Password Requirements</TabsTrigger>
          <TabsTrigger value={ParameterTab.Ssl}>SSL</TabsTrigger>
        </TabsList>
        <TabsContent value={ParameterTab.PasswordRequirements}>
          <PasswordRequirementsFields defaultRequirements={HP_ILO_DEFAULT_PASSWORD_REQUIREMENTS} />
        </TabsContent>
        <TabsContent value={ParameterTab.Ssl}>
          <Controller
            name="parameters.sslRejectUnauthorized"
            control={control}
            defaultValue
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <Field orientation="horizontal">
                  <FieldContent>
                    <Label htmlFor="hp-ilo-ssl-reject-unauthorized">Reject Unauthorized</Label>
                    <FieldDescription>
                      If enabled, Infisical will only connect if the iLO presents a valid, trusted
                      SSL certificate. Disable this for self-signed certificates or provide a CA
                      certificate below.
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    aria-invalid={Boolean(error)}
                    id="hp-ilo-ssl-reject-unauthorized"
                    variant={scopeVariant}
                    checked={value ?? true}
                    onCheckedChange={onChange}
                  />
                </Field>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="parameters.sslCertificate"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="hp-ilo-ssl-certificate">
                  SSL Certificate <span className="text-muted">(optional)</span>
                </FieldLabel>
                <TextArea
                  id="hp-ilo-ssl-certificate"
                  className="h-[3.6rem] resize-none!"
                  {...field}
                  placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </TabsContent>
      </Tabs>
    </>
  );
};

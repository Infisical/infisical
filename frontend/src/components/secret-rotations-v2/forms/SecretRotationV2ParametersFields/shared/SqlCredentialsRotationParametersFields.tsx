import { Controller, useFormContext } from "react-hook-form";
import { ClipboardCheckIcon, CopyIcon, InfoIcon } from "lucide-react";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { ValidationRuleOverrideNotice } from "@app/components/secret-validation/ValidationRuleOverrideNotice";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Field,
  FieldError,
  FieldFeedback,
  IconButton,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";
import {
  SecretRotationRuleProvider,
  SecretValidationRuleType
} from "@app/hooks/api/secretValidationRules";

import { DEFAULT_PASSWORD_REQUIREMENTS } from "../../schemas/shared";

enum ParameterTab {
  Statement = "statement",
  Advanced = "advance"
}

export const SqlCredentialsRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type:
        | SecretRotation.PostgresCredentials
        | SecretRotation.MsSqlCredentials
        | SecretRotation.OracleDBCredentials;
    }
  >();
  const type = watch("type");

  const { rotationOption } = useSecretRotationV2Option(type);
  const [, isCopied, setCopyState] = useTimedReset({ initialState: false });
  const environmentSlug = watch("environment")?.slug;
  const secretPath = watch("secretPath");

  const handleCopy = () => {
    navigator.clipboard.writeText(rotationOption!.template.createUserStatement);
    setCopyState(true);
  };

  return (
    <Tabs defaultValue={ParameterTab.Statement}>
      <TabsList variant="project" className="w-full justify-start">
        <TabsTrigger value={ParameterTab.Statement}>General</TabsTrigger>
        <TabsTrigger value={ParameterTab.Advanced}>Advanced</TabsTrigger>
      </TabsList>
      <TabsContent value={ParameterTab.Statement}>
        <div className="flex items-start gap-x-2">
          <Controller
            render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
              <Field className="flex-1" data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip htmlFor="sql-username-1">
                  Database Username 1
                </FieldLabelWithTooltip>
                <Input
                  ref={ref}
                  id="sql-username-1"
                  value={value}
                  onBlur={onBlur}
                  onChange={onChange}
                  placeholder={
                    rotationOption.connection === AppConnection.OracleDB
                      ? "INFISICAL_USER_1"
                      : "infisical_user_1"
                  }
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
            control={control}
            name="parameters.username1"
          />
          <Controller
            render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
              <Field className="flex-1" data-invalid={Boolean(error)}>
                <FieldLabelWithTooltip htmlFor="sql-username-2">
                  Database Username 2
                </FieldLabelWithTooltip>
                <Input
                  ref={ref}
                  id="sql-username-2"
                  value={value}
                  onBlur={onBlur}
                  onChange={onChange}
                  placeholder={
                    rotationOption.connection === AppConnection.OracleDB
                      ? "INFISICAL_USER_2"
                      : "infisical_user_2"
                  }
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
            control={control}
            name="parameters.username2"
          />
        </div>

        <Alert variant="info">
          <InfoIcon />
          <AlertTitle>Example Create User Statement</AlertTitle>
          <AlertDescription>
            <p className="mb-3 text-sm">
              Infisical requires two database users to be created for rotation.
            </p>
            <p className="mb-3 text-sm">
              These users are intended to be solely managed by Infisical. Altering their login after
              rotation may cause unexpected failure.
            </p>
            <p className="mb-3 text-sm">
              Below is an example statement for creating the required users. You may need to modify
              it to suit your needs.
            </p>
            <div className="relative mb-3">
              <pre className="max-h-[10vh] overflow-auto rounded-sm border border-border bg-container p-2 pr-9 text-sm break-words whitespace-pre-wrap text-muted">
                {rotationOption!.template.createUserStatement}
              </pre>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="absolute top-1.5 right-1.5 text-muted hover:text-foreground"
                    aria-label={isCopied ? "Copied" : "Copy"}
                    onClick={handleCopy}
                  >
                    {isCopied ? (
                      <ClipboardCheckIcon className="size-3.5" />
                    ) : (
                      <CopyIcon className="size-3.5" />
                    )}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{isCopied ? "Copied!" : "Copy"}</TooltipContent>
              </Tooltip>
            </div>
          </AlertDescription>
        </Alert>
      </TabsContent>
      <TabsContent value={ParameterTab.Advanced}>
        <Controller
          control={control}
          name="parameters.rotationStatement"
          defaultValue={rotationOption?.template?.rotationStatement}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabelWithTooltip>Rotation Statement</FieldLabelWithTooltip>
              <TextArea
                {...field}
                className="resize-none text-sm"
                rows={3}
                isError={Boolean(error)}
                aria-describedby="sql-rotation-statement-feedback"
              />
              <FieldFeedback
                id="sql-rotation-statement-feedback"
                description="username, password and database are dynamically provisioned"
                error={error?.message}
              />
            </Field>
          )}
        />
        <div className="flex flex-col gap-3">
          {type === SecretRotation.PostgresCredentials && (
            <ValidationRuleOverrideNotice
              type={SecretValidationRuleType.SecretRotations}
              provider={SecretRotationRuleProvider.PostgresCredentials}
              environmentSlug={environmentSlug}
              secretPath={secretPath}
            />
          )}
          <div className="w-full border-b border-border">
            <span className="text-sm text-label">Password Requirements</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-sm border border-border bg-card px-3 pt-3">
            <Controller
              control={control}
              name="parameters.passwordRequirements.length"
              defaultValue={
                // for oracle 48 would throw error
                type === SecretRotation.OracleDBCredentials
                  ? 30
                  : DEFAULT_PASSWORD_REQUIREMENTS.length
              }
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
      </TabsContent>
    </Tabs>
  );
};

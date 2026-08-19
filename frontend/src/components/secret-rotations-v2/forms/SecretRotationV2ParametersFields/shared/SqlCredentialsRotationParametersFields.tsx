import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { ValidationRuleOverrideNotice } from "@app/components/secret-validation/ValidationRuleOverrideNotice";
import {
  Field,
  FieldError,
  FieldFeedback,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea
} from "@app/components/v3";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretRotation, useSecretRotationV2Option } from "@app/hooks/api/secretRotationsV2";
import {
  SecretRotationRuleProvider,
  SecretValidationRuleType
} from "@app/hooks/api/secretValidationRules";

import { DEFAULT_PASSWORD_REQUIREMENTS } from "../../schemas/shared";
import { CreateUserStatementAlert } from "./CreateUserStatementAlert";
import { PasswordRequirementsFields } from "./PasswordRequirementsFields";

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
  const environmentSlug = watch("environment")?.slug;
  const secretPath = watch("secretPath");

  return (
    <Tabs defaultValue={ParameterTab.Statement}>
      <TabsList variant="project" className="w-full justify-start">
        <TabsTrigger value={ParameterTab.Statement}>General</TabsTrigger>
        <TabsTrigger value={ParameterTab.Advanced}>Advanced</TabsTrigger>
      </TabsList>
      <TabsContent value={ParameterTab.Statement} className="space-y-4">
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

        <CreateUserStatementAlert statement={rotationOption!.template.createUserStatement} />
      </TabsContent>
      <TabsContent value={ParameterTab.Advanced} className="space-y-4">
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
        {type === SecretRotation.PostgresCredentials && (
          <ValidationRuleOverrideNotice
            type={SecretValidationRuleType.SecretRotations}
            provider={SecretRotationRuleProvider.PostgresCredentials}
            environmentSlug={environmentSlug}
            secretPath={secretPath}
          />
        )}
        <PasswordRequirementsFields
          defaultRequirements={{
            ...DEFAULT_PASSWORD_REQUIREMENTS,
            // Oracle limits generated passwords to 30 characters.
            length:
              type === SecretRotation.OracleDBCredentials
                ? 30
                : DEFAULT_PASSWORD_REQUIREMENTS.length
          }}
        />
      </TabsContent>
    </Tabs>
  );
};

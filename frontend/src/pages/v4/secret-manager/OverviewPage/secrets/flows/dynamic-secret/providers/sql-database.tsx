import { Controller, type Path, useFormContext } from "react-hook-form";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet
} from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import {
  getSqlClientResetValues,
  getSqlDatabaseCreateDefaultValues,
  getSqlDatabaseCreatePayload,
  getSqlDatabaseEditDefaultValues,
  getSqlDatabaseEditPayload,
  normalizeSqlGatewayValueForMode,
  sqlDatabaseCreateFormSchema,
  sqlDatabaseEditFormSchema,
  type TSqlDatabaseFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/sqlDatabaseContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders, SqlProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  GatewayPicker,
  MetadataFields,
  numberInput,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider, type DynamicSecretRendererProps } from "../types";

const sqlConnectionFields = [
  { name: "inputs.host", type: "text", label: "Host", placeholder: "db.example.com" },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "postgres",
    autoComplete: "off",
    layout: "half"
  },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    placeholder: "Enter database password",
    autoComplete: "new-password",
    layout: "half"
  },
  {
    name: "inputs.database",
    type: "text",
    label: "Database Name",
    placeholder: "app_db",
    layout: "half"
  }
] satisfies readonly TDynamicSecretProviderField<TSqlDatabaseFormValues>[];

const sqlStatementFields = [
  {
    name: "inputs.creationStatement",
    type: "textarea",
    label: "Creation Statement",
    description: "Username, password, and expiration are dynamically provisioned.",
    rows: 3
  },
  {
    name: "inputs.revocationStatement",
    type: "textarea",
    label: "Revocation Statement",
    description: "Username is dynamically provisioned.",
    rows: 3
  },
  {
    name: "inputs.renewStatement",
    type: "textarea",
    label: "Renew Statement",
    description: "Username and expiration are dynamically provisioned.",
    rows: 3
  }
] satisfies readonly TDynamicSecretProviderField<TSqlDatabaseFormValues>[];

type NumericRequirement = "length" | "lowercase" | "uppercase" | "digits" | "symbols";

const requirementLabels: Record<NumericRequirement, string> = {
  length: "Password Length",
  lowercase: "Lowercase Count",
  uppercase: "Uppercase Count",
  digits: "Digit Count",
  symbols: "Symbol Count"
};

const SqlPasswordNumberField = ({ fieldName }: { fieldName: NumericRequirement }) => {
  const { control } = useFormContext<TSqlDatabaseFormValues>();
  const isLength = fieldName === "length";
  const name: Path<TSqlDatabaseFormValues> = isLength
    ? "inputs.passwordRequirements.length"
    : `inputs.passwordRequirements.required.${fieldName}`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field wide label={requirementLabels[fieldName]} error={fieldError(error)}>
          <Input
            ref={field.ref}
            name={field.name}
            type="number"
            min={isLength ? 1 : 0}
            max={isLength ? 250 : undefined}
            value={field.value ?? ""}
            invalid={Boolean(error)}
            onBlur={field.onBlur}
            onChange={(event) => field.onChange(numberInput(event.currentTarget.value))}
          />
        </Field>
      )}
    />
  );
};

const SqlPasswordConfiguration = () => {
  const { control, formState, watch } = useFormContext<TSqlDatabaseFormValues>();
  const required = watch("inputs.passwordRequirements.required");
  const length = watch("inputs.passwordRequirements.length") ?? 0;
  const total = Object.values(required ?? {}).reduce((sum, count) => sum + Number(count || 0), 0);
  const requirementsError = (
    formState.errors.inputs?.passwordRequirements as { message?: string } | undefined
  )?.message;
  const totalCopy = `Total required characters: ${total} ${total > length ? `(exceeds length of ${length})` : ""}`;

  return (
    <ProviderGroup
      id="sql-password-config"
      presentation="collapse"
      title="Password Configuration (optional)"
    >
      <SqlPasswordNumberField fieldName="length" />
      <FieldSet>
        <FieldLegend>Minimum Required Character Counts</FieldLegend>
        {total > length ? (
          <FieldError>{totalCopy}</FieldError>
        ) : (
          <FieldDescription>{totalCopy}</FieldDescription>
        )}
        <div className="grid grid-cols-2 gap-4">
          <SqlPasswordNumberField fieldName="lowercase" />
          <SqlPasswordNumberField fieldName="uppercase" />
          <SqlPasswordNumberField fieldName="digits" />
          <SqlPasswordNumberField fieldName="symbols" />
        </div>
        {requirementsError && <FieldError>{requirementsError}</FieldError>}
      </FieldSet>
      <Controller
        control={control}
        name="inputs.passwordRequirements.allowedSymbols"
        render={({ field, fieldState: { error } }) => (
          <Field
            wide
            label="Symbols to use in password"
            description="Default: -_.~!*"
            error={fieldError(error)}
          >
            <Input
              {...field}
              value={field.value ?? ""}
              placeholder="-_.~!*"
              invalid={Boolean(error)}
            />
          </Field>
        )}
      />
    </ProviderGroup>
  );
};

const SqlDatabaseFields = ({ mode }: Pick<DynamicSecretRendererProps, "mode">) => {
  const { control, setValue, watch } = useFormContext<TSqlDatabaseFormValues>();
  const selectedClient = watch("inputs.client") ?? SqlProviders.Postgres;
  const gatewayPoolId = watch("inputs.gatewayPoolId");

  return (
    <>
      <ProviderGroup id="sql-database-connection">
        <Controller
          control={control}
          name="inputs.gatewayId"
          render={({ field, fieldState: { error } }) => (
            <Field wide label="Gateway" error={fieldError(error)}>
              <GatewayPicker
                invalid={Boolean(error)}
                value={{ gatewayId: field.value ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId, gatewayPoolId: nextGatewayPoolId }) => {
                  field.onChange(normalizeSqlGatewayValueForMode(mode, gatewayId));
                  setValue(
                    "inputs.gatewayPoolId",
                    normalizeSqlGatewayValueForMode(mode, nextGatewayPoolId),
                    { shouldDirty: true }
                  );
                }}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="inputs.client"
          render={({ field, fieldState: { error } }) => (
            <Field wide label="Service" error={fieldError(error)}>
              <Select
                value={field.value ?? SqlProviders.Postgres}
                disabled={mode === "edit"}
                invalid={Boolean(error)}
                options={[
                  { value: SqlProviders.Postgres, label: "PostgreSQL" },
                  { value: SqlProviders.MySql, label: "MySQL" },
                  { value: SqlProviders.Oracle, label: "Oracle" },
                  { value: SqlProviders.MsSQL, label: "Microsoft SQL Server" }
                ]}
                onValueChange={(value) => {
                  if (!value || value === field.value) return;
                  const client = value as SqlProviders;
                  field.onChange(client);
                  const resetValues = getSqlClientResetValues(client);
                  setValue("inputs.creationStatement", resetValues.creationStatement);
                  setValue("inputs.renewStatement", resetValues.renewStatement);
                  setValue("inputs.revocationStatement", resetValues.revocationStatement);
                  setValue("inputs.port", resetValues.port);
                  setValue("inputs.passwordRequirements.length", resetValues.passwordLength);
                }}
              />
            </Field>
          )}
        />

        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-4">
            <ProviderFields fields={sqlConnectionFields.slice(0, 1)} />
          </div>
          <Controller
            control={control}
            name="inputs.port"
            render={({ field, fieldState: { error } }) => (
              <Field wide label="Port" error={fieldError(error)}>
                <Input
                  ref={field.ref}
                  name={field.name}
                  type="number"
                  value={field.value ?? ""}
                  invalid={Boolean(error)}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(numberInput(event.currentTarget.value))}
                />
              </Field>
            )}
          />
        </div>
        <ProviderFields fields={sqlConnectionFields.slice(1)} />

        {selectedClient === SqlProviders.MsSQL && (
          <Controller
            control={control}
            name="inputs.sslEnabled"
            render={({ field, fieldState: { error } }) => (
              <Stack gap={4}>
                <Switch
                  ref={field.ref}
                  layout="row"
                  label="Encrypt Connection (SSL)"
                  checked={field.value ?? false}
                  onBlur={field.onBlur}
                  onCheckedChange={field.onChange}
                  aria-invalid={Boolean(error) || undefined}
                />
                {fieldError(error) && <FieldError>{fieldError(error)}</FieldError>}
              </Stack>
            )}
          />
        )}

        <Controller
          control={control}
          name="inputs.ca"
          render={({ field, fieldState: { error } }) => (
            <Field wide label="CA (SSL)" optional error={fieldError(error)}>
              <Textarea {...field} value={field.value ?? ""} />
            </Field>
          )}
        />

        <SslRejectUnauthorizedField<TSqlDatabaseFormValues> description="Reject server certificates not signed by the supplied CA. Turn off for self-signed certificates." />
      </ProviderGroup>

      <MetadataFields id="sql-metadata" />
      <ProviderGroup
        id="sql-statements"
        presentation="collapse"
        title="Creation, Revocation & Renew Statements (optional)"
      >
        <ProviderFields<TSqlDatabaseFormValues> fields={[usernameTemplateFieldDefinition]} />
        <ProviderFields fields={sqlStatementFields} />
      </ProviderGroup>
      <SqlPasswordConfiguration />
    </>
  );
};

export const sqlDatabaseFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.SqlDatabase,
  label: "SQL Database",
  schema: sqlDatabaseCreateFormSchema,
  getDefaultValues: getSqlDatabaseCreateDefaultValues,
  toPayload: getSqlDatabaseCreatePayload,
  Renderer: SqlDatabaseFields,
  submitLabel: "Submit",
  edit: {
    schema: sqlDatabaseEditFormSchema,
    getDefaultValues: getSqlDatabaseEditDefaultValues,
    toPayload: getSqlDatabaseEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

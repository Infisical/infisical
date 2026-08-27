import { useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { InfoIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { ValidationRuleOverrideNotice } from "@app/components/secret-validation/ValidationRuleOverrideNotice";
import {
  Alert,
  AlertAction,
  AlertDescription,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TextArea
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { SecretInput } from "@app/components/v3/platform/SecretInput";
import { ProjectPermissionSub, useProject } from "@app/context";
import { OrgPermissionSubjects } from "@app/context/OrgPermissionContext";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { useCanUseProjectAppConnectionImport } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { DynamicSecretProviders, SqlProviders } from "@app/hooks/api/dynamicSecret/types";
import type { VaultDatabaseRole } from "@app/hooks/api/migration/types";
import {
  DynamicSecretRuleProvider,
  SecretValidationRuleType
} from "@app/hooks/api/secretValidationRules";
import { VaultSqlDatabaseImportModal } from "@app/pages/secret-manager/SecretDashboardPage/components/ActionBar/CreateDynamicSecretForm/VaultSqlDatabaseImportModal";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { parseDynamicSecretProviderNumberInput } from "../scalarValues";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps
} from "../types";
import {
  getSqlClientResetValues,
  getSqlDatabaseCreateDefaultValues,
  getSqlDatabaseCreatePayload,
  getSqlDatabaseEditDefaultValues,
  getSqlDatabaseEditPayload,
  getSqlDatabaseVaultImportValues,
  normalizeSqlGatewayValueForMode,
  SQL_DATABASE_CUSTOM_RENDERER_REASONS,
  sqlDatabaseCreateFormSchema,
  sqlDatabaseEditFormSchema,
  TSqlDatabaseFormValues
} from "./sqlDatabaseContract";

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

const usernameTemplateField = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  }
] satisfies readonly TDynamicSecretProviderField<TSqlDatabaseFormValues>[];

const SqlVaultImport = ({ onImport }: { onImport: (role: VaultDatabaseRole) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { projectId } = useProject();
  const canUseAppConnectionImport = useCanUseProjectAppConnectionImport(
    ProjectPermissionSub.Secrets
  );
  const { data: vaultAppConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: canUseAppConnectionImport }
  );

  if (!canUseAppConnectionImport || vaultAppConnections.length === 0) return null;

  return (
    <>
      <Alert variant="info">
        <InfoIcon />
        <AlertDescription>
          <span>Load values from HashiCorp Vault.</span>
          <AlertAction>
            <Button type="button" size="sm" variant="info" onClick={() => setIsOpen(true)}>
              <img src="/images/integrations/Vault.png" alt="" className="size-4" />
              Load from Vault
            </Button>
          </AlertAction>
        </AlertDescription>
      </Alert>
      <VaultSqlDatabaseImportModal
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        appConnections={vaultAppConnections}
        onImport={onImport}
      />
    </>
  );
};

const SqlMetadataFields = () => {
  const { control } = useFormContext<TSqlDatabaseFormValues>();
  const metadataFields = useFieldArray({ control, name: "metadata" });

  return (
    <DynamicSecretProviderGroup id="sql-metadata" presentation="panel" surface title="Metadata">
      {metadataFields.fields.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-5 text-center">
          <FieldDescription>No metadata entries</FieldDescription>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => metadataFields.append({ key: "", value: "" })}
          >
            <PlusIcon />
            Add entry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {metadataFields.fields.map((metadataField, index) => (
            <div
              key={metadataField.id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              {(["key", "value"] as const).map((key) => (
                <Controller
                  key={key}
                  control={control}
                  name={`metadata.${index}.${key}`}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`sql-metadata-${index}-${key}`}>
                        {key === "key" ? "Key" : "Value"}
                        {key === "value" && (
                          <span className="font-normal text-muted">(optional)</span>
                        )}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`sql-metadata-${index}-${key}`}
                        isError={Boolean(error)}
                        aria-describedby={error ? `sql-metadata-${index}-${key}-error` : undefined}
                      />
                      <FieldError id={`sql-metadata-${index}-${key}-error`}>
                        {error?.message}
                      </FieldError>
                    </Field>
                  )}
                />
              ))}
              <div className="flex flex-col gap-2">
                <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                  &nbsp;
                </FieldLabel>
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={`Remove metadata entry ${index + 1}`}
                  onClick={() => metadataFields.remove(index)}
                >
                  <Trash2Icon />
                </IconButton>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => metadataFields.append({ key: "", value: "" })}
          >
            <PlusIcon />
            Add entry
          </Button>
        </div>
      )}
    </DynamicSecretProviderGroup>
  );
};

type NumericRequirement = "length" | "lowercase" | "uppercase" | "digits" | "symbols";

const SqlPasswordNumberField = ({ fieldName }: { fieldName: NumericRequirement }) => {
  const { control } = useFormContext<TSqlDatabaseFormValues>();
  const isLength = fieldName === "length";
  const name = isLength
    ? ("inputs.passwordRequirements.length" as const)
    : (`inputs.passwordRequirements.required.${fieldName}` as const);
  const labels: Record<NumericRequirement, string> = {
    length: "Password Length",
    lowercase: "Lowercase Count",
    uppercase: "Uppercase Count",
    digits: "Digit Count",
    symbols: "Symbol Count"
  };
  const descriptions: Partial<Record<NumericRequirement, string>> = {
    lowercase: "Minimum number of lowercase letters",
    uppercase: "Minimum number of uppercase letters",
    digits: "Minimum number of digits",
    symbols: "Minimum number of symbols"
  };
  const feedbackId = descriptions[fieldName]
    ? `sql-password-${fieldName}-feedback`
    : `sql-password-${fieldName}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor={`sql-password-${fieldName}`}>{labels[fieldName]}</FieldLabel>
          <Input
            ref={field.ref}
            id={`sql-password-${fieldName}`}
            name={field.name}
            type="number"
            min={isLength ? 1 : 0}
            max={isLength ? 250 : undefined}
            value={field.value ?? ""}
            onBlur={field.onBlur}
            onChange={(event) =>
              field.onChange(parseDynamicSecretProviderNumberInput(event.currentTarget.value))
            }
            isError={Boolean(error)}
            aria-describedby={feedbackId}
          />
          {descriptions[fieldName] ? (
            <FieldFeedback
              id={feedbackId}
              description={descriptions[fieldName]}
              error={error?.message}
            />
          ) : (
            <FieldError id={feedbackId}>{error?.message}</FieldError>
          )}
        </Field>
      )}
    />
  );
};

const SqlPasswordConfiguration = ({
  mode,
  secretPath
}: {
  mode: TDynamicSecretProviderRendererProps["mode"];
  secretPath: string;
}) => {
  const { control, formState, watch } = useFormContext<TSqlDatabaseFormValues>();
  const required = watch("inputs.passwordRequirements.required");
  const length = watch("inputs.passwordRequirements.length") ?? 0;
  const total = Object.values(required ?? {}).reduce((sum, count) => sum + Number(count || 0), 0);
  const requirementsError = (
    formState.errors.inputs?.passwordRequirements as { message?: string } | undefined
  )?.message;

  return (
    <DynamicSecretProviderGroup
      id="sql-password-config"
      presentation="collapse"
      title="Password Configuration (optional)"
    >
      {mode === "create" && (
        <ValidationRuleOverrideNotice
          type={SecretValidationRuleType.DynamicSecrets}
          provider={DynamicSecretRuleProvider.SqlDatabase}
          environmentSlug={watch("environment")?.slug}
          secretPath={secretPath}
        />
      )}
      <FieldDescription>Set constraints on the generated database password.</FieldDescription>
      <SqlPasswordNumberField fieldName="length" />
      <FieldSet>
        <FieldLegend variant="label">Minimum Required Character Counts</FieldLegend>
        <FieldDescription className={total > length ? "text-danger" : undefined}>
          Total required characters: {total} {total > length ? `(exceeds length of ${length})` : ""}
        </FieldDescription>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SqlPasswordNumberField fieldName="lowercase" />
          <SqlPasswordNumberField fieldName="uppercase" />
          <SqlPasswordNumberField fieldName="digits" />
          <SqlPasswordNumberField fieldName="symbols" />
        </div>
        <FieldError>{requirementsError}</FieldError>
      </FieldSet>
      <Controller
        control={control}
        name="inputs.passwordRequirements.allowedSymbols"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="sql-password-allowed-symbols">
              Symbols to use in password
            </FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id="sql-password-allowed-symbols"
              placeholder="-_.~!*"
              isError={Boolean(error)}
              aria-describedby="sql-password-allowed-symbols-feedback"
            />
            <FieldFeedback
              id="sql-password-allowed-symbols-feedback"
              description="Default: -_.~!*"
              error={error?.message}
            />
          </Field>
        )}
      />
    </DynamicSecretProviderGroup>
  );
};

const SqlAdvancedConfiguration = () => {
  const { control } = useFormContext<TSqlDatabaseFormValues>();
  const statements = [
    {
      name: "inputs.creationStatement" as const,
      label: "Creation Statement",
      description: "username, password and expiration are dynamically provisioned"
    },
    {
      name: "inputs.revocationStatement" as const,
      label: "Revocation Statement",
      description: "username is dynamically provisioned"
    },
    {
      name: "inputs.renewStatement" as const,
      label: "Renew Statement",
      description: "username and expiration are dynamically provisioned"
    }
  ];

  return (
    <DynamicSecretProviderGroup
      id="sql-statements"
      presentation="collapse"
      title="Creation, Revocation & Renew Statements (optional)"
    >
      <DynamicSecretProviderFields fields={usernameTemplateField} />
      <FieldDescription>
        Customize SQL statements for managing database user lifecycle.
      </FieldDescription>
      {statements.map(({ name, label, description }) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`sql-${name.split(".").at(-1)}`}>{label}</FieldLabel>
              <TextArea
                {...field}
                value={field.value ?? ""}
                id={`sql-${name.split(".").at(-1)}`}
                rows={3}
                isError={Boolean(error)}
                aria-describedby={`sql-${name.split(".").at(-1)}-feedback`}
              />
              <FieldFeedback
                id={`sql-${name.split(".").at(-1)}-feedback`}
                description={description}
                error={error?.message}
              />
            </Field>
          )}
        />
      ))}
    </DynamicSecretProviderGroup>
  );
};

const SqlDatabaseFields = ({
  mode,
  context
}: Pick<TDynamicSecretProviderRendererProps, "mode" | "context">) => {
  const { control, setValue, watch } = useFormContext<TSqlDatabaseFormValues>();
  const selectedClient = watch("inputs.client") ?? SqlProviders.Postgres;
  const gatewayPoolId = watch("inputs.gatewayPoolId");

  const handleVaultImport = (role: VaultDatabaseRole) => {
    try {
      const imported = getSqlDatabaseVaultImportValues(role);
      setValue("name", imported.name);
      setValue("inputs.client", imported.inputs.client);

      const importableInputKeys = [
        "host",
        "port",
        "database",
        "username",
        "ca",
        "creationStatement",
        "revocationStatement",
        "renewStatement"
      ] as const;
      importableInputKeys.forEach((key) => {
        const value = imported.inputs[key];
        if (value !== undefined) setValue(`inputs.${key}`, value);
      });
      if (imported.defaultTTL) setValue("defaultTTL", imported.defaultTTL);
      if (imported.maxTTL) setValue("maxTTL", imported.maxTTL);

      if (imported.connectionUrlParseFailed) {
        createNotification({
          type: "info",
          text: "Could not parse connection URL. Host, port, and database fields may need to be filled manually."
        });
      }
      createNotification({
        type: "info",
        text: "Configuration loaded successfully from HashiCorp Vault"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to load configuration from HashiCorp Vault"
      });
    }
  };

  return (
    <>
      {mode === "create" && <SqlVaultImport onImport={handleVaultImport} />}
      <DynamicSecretProviderGroup id="sql-database-connection" presentation="panel">
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Controller
              control={control}
              name="inputs.gatewayId"
              render={({ field, fieldState: { error } }) => {
                const description = !isAllowed
                  ? "You don't have permission to attach gateways to resources."
                  : undefined;
                const hasFeedback = Boolean(description || error?.message);

                return (
                  <Field data-invalid={Boolean(error)} data-disabled={!isAllowed}>
                    <FieldTitle>Gateway</FieldTitle>
                    <GatewayPicker
                      isDisabled={!isAllowed}
                      isError={Boolean(error)}
                      value={{
                        gatewayId: field.value ?? null,
                        gatewayPoolId: gatewayPoolId ?? null
                      }}
                      onChange={({ gatewayId, gatewayPoolId: nextGatewayPoolId }) => {
                        field.onChange(normalizeSqlGatewayValueForMode(mode, gatewayId));
                        setValue(
                          "inputs.gatewayPoolId",
                          normalizeSqlGatewayValueForMode(mode, nextGatewayPoolId),
                          { shouldDirty: true }
                        );
                      }}
                    />
                    {hasFeedback && (
                      <FieldFeedback
                        id="sql-database-gateway-feedback"
                        description={description}
                        error={error?.message}
                      />
                    )}
                  </Field>
                );
              }}
            />
          )}
        </OrgPermissionCan>

        <Controller
          control={control}
          name="inputs.client"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)} data-disabled={mode === "edit"}>
              <FieldLabel htmlFor="sql-database-service">Service</FieldLabel>
              <Select
                value={field.value ?? SqlProviders.Postgres}
                disabled={mode === "edit"}
                onValueChange={(value) => {
                  // Radix Select can emit a spurious empty onValueChange while options mount
                  // (esp. inside a <form>). Ignore it so create defaults don't trip the dirty guard.
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
              >
                <SelectTrigger
                  ref={field.ref}
                  id="sql-database-service"
                  className="w-full"
                  isError={Boolean(error)}
                  onBlur={field.onBlur}
                  aria-describedby={error ? "sql-database-service-error" : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SqlProviders.Postgres}>PostgreSQL</SelectItem>
                  <SelectItem value={SqlProviders.MySql}>MySQL</SelectItem>
                  <SelectItem value={SqlProviders.Oracle}>Oracle</SelectItem>
                  <SelectItem value={SqlProviders.MsSQL}>Microsoft SQL Server</SelectItem>
                </SelectContent>
              </Select>
              <FieldError id="sql-database-service-error">{error?.message}</FieldError>
            </Field>
          )}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <DynamicSecretProviderFields fields={sqlConnectionFields.slice(0, 1)} />
          <Controller
            control={control}
            name="inputs.port"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="sql-database-port">Port</FieldLabel>
                <Input
                  ref={field.ref}
                  id="sql-database-port"
                  name={field.name}
                  type="number"
                  value={field.value ?? ""}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(parseDynamicSecretProviderNumberInput(event.currentTarget.value))
                  }
                  isError={Boolean(error)}
                  aria-describedby={error ? "sql-database-port-error" : undefined}
                />
                <FieldError id="sql-database-port-error">{error?.message}</FieldError>
              </Field>
            )}
          />
        </div>
        <DynamicSecretProviderFields fields={sqlConnectionFields.slice(1)} />

        {selectedClient === SqlProviders.MsSQL && (
          <Controller
            control={control}
            name="inputs.sslEnabled"
            render={({ field, fieldState: { error } }) => (
              <Field orientation="horizontal" data-invalid={Boolean(error)}>
                <FieldContent>
                  <FieldTitle>Encrypt Connection (SSL)</FieldTitle>
                  <FieldError id="sql-database-ssl-enabled-error">{error?.message}</FieldError>
                </FieldContent>
                <Switch
                  ref={field.ref}
                  checked={field.value ?? false}
                  onBlur={field.onBlur}
                  onCheckedChange={field.onChange}
                  aria-label="Encrypt Connection (SSL)"
                  aria-describedby={error ? "sql-database-ssl-enabled-error" : undefined}
                />
              </Field>
            )}
          />
        )}

        <Controller
          control={control}
          name="inputs.ca"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="sql-database-ca">
                CA (SSL) <span className="font-normal text-muted">(optional)</span>
              </FieldLabel>
              <SecretInput
                {...field}
                value={field.value ?? ""}
                id="sql-database-ca"
                aria-describedby={error ? "sql-database-ca-error" : undefined}
              />
              <FieldError id="sql-database-ca-error">{error?.message}</FieldError>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="inputs.sslRejectUnauthorized"
          render={({ field, fieldState: { error } }) => (
            <Field orientation="horizontal" data-invalid={Boolean(error)}>
              <FieldContent>
                <FieldTitle>SSL Reject Unauthorized</FieldTitle>
                <FieldFeedback
                  id="sql-database-ssl-reject-feedback"
                  description="Verify the server certificate against the supplied certificate authorities. Disable this option when using a self-signed certificate."
                  error={error?.message}
                />
              </FieldContent>
              <Switch
                ref={field.ref}
                checked={field.value ?? true}
                onBlur={field.onBlur}
                onCheckedChange={field.onChange}
                aria-label="SSL Reject Unauthorized"
                aria-describedby="sql-database-ssl-reject-feedback"
              />
            </Field>
          )}
        />
      </DynamicSecretProviderGroup>

      <SqlMetadataFields />
      <SqlAdvancedConfiguration />
      <SqlPasswordConfiguration mode={mode} secretPath={context.secretPath} />
    </>
  );
};

export const sqlDatabaseDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.SqlDatabase,
  label: "SQL Database",
  customRenderer: {
    reasons: SQL_DATABASE_CUSTOM_RENDERER_REASONS,
    Component: SqlDatabaseFields
  },
  create: {
    schema: sqlDatabaseCreateFormSchema,
    getDefaultValues: getSqlDatabaseCreateDefaultValues,
    toPayload: getSqlDatabaseCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: sqlDatabaseEditFormSchema,
    getDefaultValues: getSqlDatabaseEditDefaultValues,
    toPayload: getSqlDatabaseEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

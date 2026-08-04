import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input,
  Switch
} from "@app/components/v3";
import { GatewayPicker, SecretInput } from "@app/components/v3/platform";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps
} from "../types";
import {
  azureSqlCreateFormSchema,
  azureSqlEditFormSchema,
  getAzureSqlCreateDefaultValues,
  getAzureSqlCreatePayload,
  getAzureSqlEditDefaultValues,
  getAzureSqlEditPayload,
  normalizeAzureSqlGatewayValueForMode,
  TAzureSqlEditValues
} from "./azureSqlDatabaseContract";

const AzureSqlMetadataFields = () => {
  const { control } = useFormContext<TAzureSqlEditValues>();
  const metadata = useFieldArray({ control, name: "metadata" });
  return (
    <DynamicSecretProviderGroup id="azure-sql-metadata" presentation="panel" surface title="Metadata">
      <div className="flex flex-col gap-3">
        {metadata.fields.map(({ id }, index) => (
          <div
            key={id}
            className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            {(["key", "value"] as const).map((key) => (
              <Controller
                key={key}
                control={control}
                name={`metadata.${index}.${key}`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`azure-sql-metadata-${index}-${key}`}>
                      {key === "key" ? "Key" : "Value"}
                      {key === "value" && (
                        <span className="font-normal text-muted"> (optional)</span>
                      )}
                    </FieldLabel>
                    <Input
                      {...field}
                      id={`azure-sql-metadata-${index}-${key}`}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            ))}
            <div className="flex flex-col gap-2">
              <FieldLabel className="invisible pointer-events-none select-none" aria-hidden>
                &nbsp;
              </FieldLabel>
              <IconButton
                type="button"
                variant="outline"
                aria-label={`Remove metadata entry ${index + 1}`}
                onClick={() => metadata.remove(index)}
              >
                <Trash2Icon />
              </IconButton>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          className="self-start"
          onClick={() => metadata.append({ key: "", value: "" })}
        >
          <PlusIcon /> Add Metadata
        </Button>
      </div>
    </DynamicSecretProviderGroup>
  );
};

const AzureSqlPasswordRequirements = () => {
  const { control } = useFormContext<TAzureSqlEditValues>();
  const countFields = [
    ["lowercase", "Lowercase Count", "Minimum number of lowercase letters"],
    ["uppercase", "Uppercase Count", "Minimum number of uppercase letters"],
    ["digits", "Digit Count", "Minimum number of digits"],
    ["symbols", "Symbol Count", "Minimum number of symbols"]
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Controller
        control={control}
        name="inputs.passwordRequirements.length"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="azure-sql-password-length">Password Length</FieldLabel>
            <Input
              ref={field.ref}
              id="azure-sql-password-length"
              name={field.name}
              type="number"
              min={1}
              max={250}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(Number(event.target.value))}
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      {countFields.map(([key, label, description]) => (
        <Controller
          key={key}
          control={control}
          name={`inputs.passwordRequirements.required.${key}`}
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`azure-sql-password-${key}`}>{label}</FieldLabel>
              <Input
                ref={field.ref}
                id={`azure-sql-password-${key}`}
                name={field.name}
                type="number"
                min={0}
                value={field.value ?? ""}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(Number(event.target.value))}
                isError={Boolean(error)}
              />
              <FieldFeedback description={description} error={error?.message} />
            </Field>
          )}
        />
      ))}
      <Controller
        control={control}
        name="inputs.passwordRequirements.allowedSymbols"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)} className="sm:col-span-2">
            <FieldLabel htmlFor="azure-sql-allowed-symbols">Symbols to use in password</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id="azure-sql-allowed-symbols"
              isError={Boolean(error)}
            />
            <FieldFeedback description="Default: -_.~!*" error={error?.message} />
          </Field>
        )}
      />
    </div>
  );
};

const AzureSqlFields = ({ mode }: TDynamicSecretProviderRendererProps) => {
  const { control, setValue, watch } = useFormContext<TAzureSqlEditValues>();
  const sslEnabled = watch("inputs.sslEnabled");
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  const scalarFields = [
    { name: "inputs.host", type: "text", label: "Host" },
    { name: "inputs.username", type: "text", label: "User", layout: "half" },
    { name: "inputs.database", type: "text", label: "Database", layout: "half" }
  ] satisfies readonly TDynamicSecretProviderField<TAzureSqlEditValues>[];
  const statementFields = [
    {
      name: "usernameTemplate",
      type: "text",
      label: "Username Template",
      placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
    },
    {
      name: "inputs.masterCreationStatement",
      type: "textarea",
      label: "Master Creation Statement",
      description: "Statement to create login in master database",
      rows: 3
    },
    {
      name: "inputs.creationStatement",
      type: "textarea",
      label: "Creation Statement",
      description: "Statement to create user in target database and grant permissions",
      rows: 3
    },
    {
      name: "inputs.revocationStatement",
      type: "textarea",
      label: "Revocation Statement",
      description: "Statement to drop user and login",
      rows: 3
    },
    {
      name: "inputs.renewStatement",
      type: "textarea",
      label: "Renew Statement",
      description: "username and expiration are dynamically provisioned",
      isOptional: true,
      rows: 3
    }
  ] satisfies readonly TDynamicSecretProviderField<TAzureSqlEditValues>[];
  return (
    <>
      <DynamicSecretProviderGroup id="azure-sql-connection" presentation="panel">
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
                    <FieldLabel htmlFor="azure-sql-gateway">Gateway</FieldLabel>
                    <GatewayPicker
                      inputId="azure-sql-gateway"
                      triggerRef={field.ref}
                      onBlur={field.onBlur}
                      isDisabled={!isAllowed}
                      isError={Boolean(error)}
                      ariaDescribedBy={hasFeedback ? "azure-sql-gateway-feedback" : undefined}
                      value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                      onChange={({ gatewayId: nextId, gatewayPoolId: nextPoolId }) => {
                        field.onChange(normalizeAzureSqlGatewayValueForMode(mode, nextId));
                        setValue(
                          "inputs.gatewayPoolId",
                          normalizeAzureSqlGatewayValueForMode(mode, nextPoolId),
                          { shouldDirty: true }
                        );
                      }}
                    />
                    {hasFeedback && (
                      <FieldFeedback
                        id="azure-sql-gateway-feedback"
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
        <DynamicSecretProviderFields fields={scalarFields} />
        <Controller
          control={control}
          name="inputs.port"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="azure-sql-port">Port</FieldLabel>
              <Input
                ref={field.ref}
                id="azure-sql-port"
                name={field.name}
                type="number"
                value={field.value ?? ""}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(Number(event.target.value))}
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="inputs.password"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="azure-sql-password">Password</FieldLabel>
              <SecretInput
                {...field}
                value={field.value ?? ""}
                id="azure-sql-password"
                aria-describedby={error ? "azure-sql-password-error" : undefined}
              />
              <FieldError id="azure-sql-password-error">{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="inputs.sslEnabled"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Enable SSL</FieldTitle>
                <FieldDescription>
                  Configure a custom CA certificate for this connection.
                </FieldDescription>
              </FieldContent>
              <Switch
                ref={field.ref}
                checked={field.value ?? false}
                onBlur={field.onBlur}
                onCheckedChange={field.onChange}
                aria-label="Enable SSL"
              />
            </Field>
          )}
        />
        {sslEnabled && (
          <>
            <DynamicSecretProviderFields
              fields={[{ name: "inputs.ca", type: "textarea", label: "CA (SSL)", isOptional: true }]}
            />
            <Controller
              control={control}
              name="inputs.sslRejectUnauthorized"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>SSL Reject Unauthorized</FieldTitle>
                    <FieldDescription>
                      Verify the server certificate against the supplied certificate authorities.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    ref={field.ref}
                    checked={field.value ?? true}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    aria-label="SSL Reject Unauthorized"
                  />
                </Field>
              )}
            />
          </>
        )}
      </DynamicSecretProviderGroup>

      <AzureSqlMetadataFields />

      <DynamicSecretProviderGroup
        id="azure-sql-statements"
        presentation="collapse"
        title="Statements and Username Template"
      >
        <DynamicSecretProviderFields fields={statementFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="azure-sql-password"
        presentation="collapse"
        title="Password Configuration (optional)"
      >
        <AzureSqlPasswordRequirements />
      </DynamicSecretProviderGroup>
    </>
  );
};

export const azureSqlDatabaseDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.AzureSqlDatabase,
  label: "Azure SQL Database",
  customRenderer: {
    reasons: [
      "conditional-fields",
      "repeatable-fields",
      "permission-aware-fields",
      "non-scalar-value"
    ],
    Component: AzureSqlFields
  },
  create: {
    schema: azureSqlCreateFormSchema,
    getDefaultValues: getAzureSqlCreateDefaultValues,
    toPayload: getAzureSqlCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: azureSqlEditFormSchema,
    getDefaultValues: getAzureSqlEditDefaultValues,
    toPayload: getAzureSqlEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

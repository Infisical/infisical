import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  CLICKHOUSE_CUSTOM_RENDERER_REASONS,
  clickHouseCreateFormSchema,
  clickHouseEditFormSchema,
  getClickHouseCreateDefaultValues,
  getClickHouseCreatePayload,
  getClickHouseEditDefaultValues,
  getClickHouseEditPayload,
  TClickHouseFormValues
} from "./clickHouseContract";

const connectionFields = [
  { name: "inputs.host", type: "text", label: "Host", layout: "half" },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  { name: "inputs.username", type: "text", label: "User", autoComplete: "off", layout: "half" },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    autoComplete: "new-password",
    layout: "half"
  },
  { name: "inputs.database", type: "text", label: "Database" },
  {
    name: "inputs.ca",
    type: "secret",
    label: "CA (SSL)",
    description: "Optionally needed for self-signed certificates.",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TClickHouseFormValues>[];

const statementFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: "{{randomUsername}}"
  },
  { name: "inputs.creationStatement", type: "textarea", label: "Creation Statement", rows: 3 },
  { name: "inputs.revocationStatement", type: "textarea", label: "Revocation Statement", rows: 3 },
  { name: "inputs.renewStatement", type: "textarea", label: "Renew Statement", rows: 3 }
] satisfies readonly TDynamicSecretProviderField<TClickHouseFormValues>[];

const passwordRequirementFields = [
  { name: "inputs.passwordRequirements.length", type: "number", label: "Password Length" },
  {
    name: "inputs.passwordRequirements.required.lowercase",
    type: "number",
    label: "Lowercase Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.uppercase",
    type: "number",
    label: "Uppercase Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.digits",
    type: "number",
    label: "Digit Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.required.symbols",
    type: "number",
    label: "Symbol Count",
    layout: "half"
  },
  {
    name: "inputs.passwordRequirements.allowedSymbols",
    type: "text",
    label: "Allowed Symbols",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TClickHouseFormValues>[];

const ClickHouseMetadataFields = () => {
  const { control } = useFormContext<TClickHouseFormValues>();
  const metadata = useFieldArray({ control, name: "metadata" });
  return (
    <DynamicSecretProviderGroup
      id="clickhouse-metadata"
      presentation="panel"
      surface
      title="Metadata"
    >
      {metadata.fields.length === 0 ? (
        <Empty className="gap-2 border p-6 md:p-6">
          <EmptyHeader>
            <EmptyTitle>No metadata entries</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" size="sm" onClick={() => metadata.append({ key: "", value: "" })}>
              <PlusIcon /> Add entry
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {metadata.fields.map(({ id }, index) => (
            <div
              key={id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <Controller
                control={control}
                name={`metadata.${index}.key`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`clickhouse-metadata-${index}-key`}>Key</FieldLabel>
                    <Input
                      {...field}
                      id={`clickhouse-metadata-${index}-key`}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`metadata.${index}.value`}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`clickhouse-metadata-${index}-value`}>
                      Value <span className="font-normal text-muted">(optional)</span>
                    </FieldLabel>
                    <Input
                      {...field}
                      id={`clickhouse-metadata-${index}-value`}
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <div className="flex flex-col gap-2">
                <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
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
            <PlusIcon /> Add entry
          </Button>
        </div>
      )}
    </DynamicSecretProviderGroup>
  );
};

const ClickHouseFields = () => {
  const { control, setValue, watch } = useFormContext<TClickHouseFormValues>();
  const gatewayId = watch("inputs.gatewayId");
  const gatewayPoolId = watch("inputs.gatewayPoolId");
  return (
    <>
      <DynamicSecretProviderGroup id="clickhouse-connection" presentation="panel">
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => (
            <Controller
              control={control}
              name="inputs.gatewayId"
              render={({ fieldState: { error } }) => {
                const description = !isAllowed
                  ? "You don't have permission to attach gateways to resources."
                  : undefined;

                return (
                  <Field data-invalid={Boolean(error)} data-disabled={!isAllowed}>
                    <FieldTitle>Gateway</FieldTitle>
                    <GatewayPicker
                      isDisabled={!isAllowed}
                      isError={Boolean(error)}
                      value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                      onChange={({ gatewayId: nextId, gatewayPoolId: nextPoolId }) => {
                        setValue("inputs.gatewayId", nextId ?? undefined, { shouldDirty: true });
                        setValue("inputs.gatewayPoolId", nextPoolId ?? undefined, {
                          shouldDirty: true
                        });
                      }}
                    />
                    {(description || error?.message) && (
                      <FieldFeedback
                        id="clickhouse-gateway-feedback"
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
        <DynamicSecretProviderFields fields={connectionFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="clickhouse-statements"
        presentation="collapse"
        title="Modify SQL Statements"
      >
        <DynamicSecretProviderFields fields={statementFields} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="clickhouse-password"
        presentation="collapse"
        title="Password Configuration (optional)"
      >
        <FieldDescription>Set constraints on the generated database password.</FieldDescription>
        <DynamicSecretProviderFields fields={passwordRequirementFields} />
      </DynamicSecretProviderGroup>

      <ClickHouseMetadataFields />
    </>
  );
};

export const clickHouseDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Clickhouse,
  label: "ClickHouse",
  customRenderer: {
    reasons: CLICKHOUSE_CUSTOM_RENDERER_REASONS,
    Component: ClickHouseFields
  },
  create: {
    schema: clickHouseCreateFormSchema,
    getDefaultValues: getClickHouseCreateDefaultValues,
    toPayload: getClickHouseCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: clickHouseEditFormSchema,
    getDefaultValues: getClickHouseEditDefaultValues,
    toPayload: getClickHouseEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

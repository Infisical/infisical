import type { ReactNode } from "react";
import { Controller, type FieldValues, type Path, useFormContext } from "react-hook-form";

import { parseDynamicSecretProviderNumberInput } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/scalarValues";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/schemas";
import {
  isDynamicSecretProviderFieldGroup,
  type TDynamicSecretProviderField,
  type TDynamicSecretProviderFieldGroup,
  type TDynamicSecretProviderFormItem
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet
} from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { Switch } from "@app/components/v4/ui/switch";
import { Textarea } from "@app/components/v4/ui/textarea";

export const fieldError = (error?: { message?: unknown }) =>
  typeof error?.message === "string" ? error.message : undefined;

export const numberInput = (value: string) => parseDynamicSecretProviderNumberInput(value);

export function ProviderFields<TValues extends FieldValues>({
  fields
}: {
  fields: readonly TDynamicSecretProviderField<TValues>[];
}) {
  const { control } = useFormContext<TValues>();
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((definition) => (
        <Controller
          key={definition.name}
          control={control}
          name={definition.name}
          render={({ field, fieldState: { error } }) => {
            const value =
              typeof field.value === "string" || typeof field.value === "number" ? field.value : "";
            const span = definition.layout === "half" ? undefined : "col-span-2";
            if (definition.type === "switch")
              return (
                <Stack gap={4} className={span}>
                  <Switch
                    ref={field.ref}
                    layout="row"
                    label={definition.label}
                    description={definition.description}
                    checked={Boolean(field.value)}
                    disabled={definition.isDisabled}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    aria-invalid={Boolean(error) || undefined}
                  />
                  {fieldError(error) && <FieldError>{fieldError(error)}</FieldError>}
                </Stack>
              );
            let input: ReactNode;
            if (definition.type === "select")
              input = (
                <Select
                  value={String(value)}
                  disabled={definition.isDisabled}
                  placeholder={definition.placeholder}
                  invalid={Boolean(error)}
                  options={definition.options}
                  onValueChange={(next) => {
                    if (!next || next === String(value)) return;
                    field.onChange(next);
                  }}
                />
              );
            else if (definition.type === "textarea")
              input = (
                <Textarea
                  ref={field.ref}
                  name={field.name}
                  value={value}
                  rows={definition.rows}
                  placeholder={definition.placeholder}
                  disabled={definition.isDisabled}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                />
              );
            else {
              const isNumber = definition.type === "number";
              let type = "text";
              if (isNumber) type = "number";
              if (definition.type === "secret") type = "password";
              input = (
                <Input
                  ref={field.ref}
                  name={field.name}
                  value={value}
                  type={type}
                  autoComplete={definition.type === "number" ? undefined : definition.autoComplete}
                  min={definition.type === "number" ? definition.min : undefined}
                  max={definition.type === "number" ? definition.max : undefined}
                  step={definition.type === "number" ? definition.step : undefined}
                  placeholder={definition.placeholder}
                  disabled={definition.isDisabled}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(
                      isNumber ? numberInput(event.currentTarget.value) : event.currentTarget.value
                    )
                  }
                />
              );
            }
            return (
              <Field
                className={span}
                label={definition.label}
                optional={definition.isOptional}
                description={definition.description}
                error={fieldError(error)}
              >
                {input}
              </Field>
            );
          }}
        />
      ))}
    </div>
  );
}

type GroupProps = {
  id: string;
  title?: string;
  description?: string;
  children: ReactNode;
} & (
  | { presentation?: "panel"; surface?: boolean }
  | { presentation: "collapse"; title: string; surface?: never }
);

export function ProviderGroup(props: GroupProps) {
  const { id, title, description, children, presentation, surface } = props;
  if (presentation === "collapse")
    return (
      <Accordion type="single" collapsible>
        <AccordionItem value={id}>
          <AccordionTrigger>{title}</AccordionTrigger>
          <AccordionContent>
            <Stack gap={16}>
              {description && <FieldDescription>{description}</FieldDescription>}
              {children}
            </Stack>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  const content =
    title || description ? (
      <FieldSet>
        {title && <FieldLegend>{title}</FieldLegend>}
        {description && <FieldDescription>{description}</FieldDescription>}
        {children}
      </FieldSet>
    ) : (
      <Stack gap={16}>{children}</Stack>
    );
  return surface ? (
    <div className="border border-[color:var(--v4-line)] p-3">{content}</div>
  ) : (
    content
  );
}

function FormItemGroup<TValues extends FieldValues>({
  group
}: {
  group: TDynamicSecretProviderFieldGroup<TValues>;
}) {
  const fields = <ProviderFields fields={group.fields} />;
  if (group.presentation === "collapse")
    return (
      <ProviderGroup
        id={group.id}
        presentation="collapse"
        title={group.title}
        description={group.description}
      >
        {fields}
      </ProviderGroup>
    );
  return (
    <ProviderGroup
      id={group.id}
      title={group.title}
      description={group.description}
      surface={group.surface ?? Boolean(group.title)}
    >
      {fields}
    </ProviderGroup>
  );
}

export function ProviderFormItems<TValues extends FieldValues>({
  items
}: {
  items: readonly TDynamicSecretProviderFormItem<TValues>[];
}) {
  const segments: (
    | { key: string; fields: TDynamicSecretProviderField<TValues>[] }
    | { key: string; group: TDynamicSecretProviderFieldGroup<TValues> }
  )[] = [];
  items.forEach((item) => {
    if (isDynamicSecretProviderFieldGroup(item)) {
      segments.push({ key: item.id, group: item });
      return;
    }
    const last = segments.at(-1);
    if (last && "fields" in last) last.fields.push(item);
    else segments.push({ key: `fields-${segments.length}`, fields: [item] });
  });
  return (
    <>
      {segments.map((segment) =>
        "group" in segment ? (
          <FormItemGroup key={segment.key} group={segment.group} />
        ) : (
          <ProviderFields key={segment.key} fields={segment.fields} />
        )
      )}
    </>
  );
}

export const usernameTemplateFieldDefinition = {
  name: "usernameTemplate",
  type: "text",
  label: "Username Template",
  placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
} as const;

type StatementCopy = { creation?: string; revocation?: string; renew?: string };

const DEFAULT_STATEMENT_COPY: Required<StatementCopy> = {
  creation: "Username, password, and expiration are dynamically provisioned.",
  revocation: "Username is dynamically provisioned.",
  renew: "Username and expiration are dynamically provisioned."
};

export const buildStatementFields = <TValues extends FieldValues>(
  options: {
    includeUsernameTemplate?: boolean;
    includeRenew?: boolean;
    renewOptional?: boolean;
    creationRows?: number;
    copy?: StatementCopy;
  } = {}
): TDynamicSecretProviderField<TValues>[] => {
  const {
    includeUsernameTemplate = true,
    includeRenew = true,
    renewOptional = true,
    creationRows = 3,
    copy = {}
  } = options;
  const resolved = { ...DEFAULT_STATEMENT_COPY, ...copy };
  const fields: TDynamicSecretProviderField<TValues>[] = [];
  if (includeUsernameTemplate)
    fields.push(usernameTemplateFieldDefinition as TDynamicSecretProviderField<TValues>);
  fields.push(
    {
      name: "inputs.creationStatement" as Path<TValues>,
      type: "textarea",
      label: "Creation Statement",
      ...(resolved.creation ? { description: resolved.creation } : {}),
      rows: creationRows
    },
    {
      name: "inputs.revocationStatement" as Path<TValues>,
      type: "textarea",
      label: "Revocation Statement",
      ...(resolved.revocation ? { description: resolved.revocation } : {}),
      rows: 3
    }
  );
  if (includeRenew)
    fields.push({
      name: "inputs.renewStatement" as Path<TValues>,
      type: "textarea",
      label: "Renew Statement",
      ...(resolved.renew ? { description: resolved.renew } : {}),
      isOptional: renewOptional,
      rows: 3
    });
  return fields;
};

export function StatementAccordion<TValues extends FieldValues>({
  title,
  fields,
  value = "statements"
}: {
  title: string;
  fields: readonly TDynamicSecretProviderField<TValues>[];
  value?: string;
}) {
  return (
    <ProviderGroup id={value} presentation="collapse" title={title}>
      <ProviderFields fields={fields} />
    </ProviderGroup>
  );
}

export function SslRejectUnauthorizedField<TValues extends FieldValues>({
  name = "inputs.sslRejectUnauthorized" as Path<TValues>,
  fallbackChecked = true,
  description = "Verify the server certificate against the supplied certificate authorities."
}: {
  name?: Path<TValues>;
  fallbackChecked?: boolean;
  description?: string;
}) {
  const { control } = useFormContext<TValues>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Stack gap={4}>
          <Switch
            ref={field.ref}
            layout="row"
            label="SSL Reject Unauthorized"
            description={description}
            checked={field.value ?? fallbackChecked}
            onBlur={field.onBlur}
            onCheckedChange={field.onChange}
            aria-invalid={Boolean(error) || undefined}
          />
          {fieldError(error) && <FieldError>{fieldError(error)}</FieldError>}
        </Stack>
      )}
    />
  );
}

export type GatewayValue = { gatewayId: string | null; gatewayPoolId: string | null };

export const localGateways = [
  { id: "local-gateway-us-east", name: "us-east-gateway", online: true },
  { id: "local-gateway-eu-west", name: "eu-west-gateway", online: false }
];
export const localGatewayPools = [{ id: "local-pool-primary", name: "primary-pool" }];

export function GatewayPicker({
  value,
  onChange,
  disabled,
  invalid,
  isRequired,
  placeholder = "Select gateway...",
  noGatewayLabel = "Internet Gateway"
}: {
  value: GatewayValue;
  onChange: (value: GatewayValue) => void;
  disabled?: boolean;
  invalid?: boolean;
  isRequired?: boolean;
  placeholder?: string;
  noGatewayLabel?: string;
}) {
  let selected = isRequired ? "" : "internet";
  if (value.gatewayPoolId) selected = `pool:${value.gatewayPoolId}`;
  else if (value.gatewayId) selected = `gateway:${value.gatewayId}`;
  return (
    <Select
      value={selected}
      disabled={disabled}
      invalid={invalid}
      placeholder={placeholder}
      options={[
        ...(isRequired ? [] : [{ value: "internet", label: noGatewayLabel }]),
        ...localGatewayPools.map((pool) => ({
          value: `pool:${pool.id}`,
          label: pool.name,
          description: "High Availability",
          group: "Gateway Pools"
        })),
        ...localGateways.map((gateway) => ({
          value: `gateway:${gateway.id}`,
          label: gateway.name,
          description: gateway.online ? "Online" : "Offline",
          group: "Individual Gateways"
        }))
      ]}
      onValueChange={(next) => {
        if (!next || next === selected) return;
        if (next === "internet") onChange({ gatewayId: null, gatewayPoolId: null });
        else if (next.startsWith("pool:"))
          onChange({ gatewayId: null, gatewayPoolId: next.replace("pool:", "") });
        else onChange({ gatewayId: next.replace("gateway:", ""), gatewayPoolId: null });
      }}
    />
  );
}

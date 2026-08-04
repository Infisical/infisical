import { Controller, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { SslRejectUnauthorizedField } from "../shared";
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  elasticSearchCreateFormSchema,
  elasticSearchEditFormSchema,
  getElasticSearchCreateDefaultValues,
  getElasticSearchCreatePayload,
  getElasticSearchEditDefaultValues,
  getElasticSearchEditPayload,
  TElasticSearchFormValues
} from "./elasticSearchContract";

const hostPortFields = [
  { name: "inputs.host", type: "text", label: "Host", layout: "half" },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" }
] satisfies readonly TDynamicSecretProviderField<TElasticSearchFormValues>[];

const advancedFields = [
  { name: "inputs.ca", type: "textarea", label: "CA (SSL)", isOptional: true, rows: 3 },
  {
    name: "usernameTemplate",
    type: "text",
    label: "Username Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
  }
] satisfies readonly TDynamicSecretProviderField<TElasticSearchFormValues>[];

const ElasticSearchFields = () => {
  const { control, setValue, watch } = useFormContext<TElasticSearchFormValues>();
  const authType = watch("inputs.auth.type");
  const roles = watch("inputs.roles") ?? [];

  const setAuthType = (type: "user" | "api-key") => {
    // Radix Select can emit a spurious empty onValueChange while options mount.
    if (!type || type === authType) return;
    setValue(
      "inputs.auth",
      type === "user" ? { type, username: "", password: "" } : { type, apiKey: "", apiKeyId: "" },
      { shouldDirty: true }
    );
  };

  return (
    <>
      <DynamicSecretProviderGroup id="elasticsearch-connection" presentation="panel">
        <DynamicSecretProviderFields fields={hostPortFields} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Controller
            control={control}
            name="inputs.auth.type"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="elasticsearch-auth-type">Authentication Method</FieldLabel>
                <Select value={field.value} onValueChange={setAuthType}>
                  <SelectTrigger
                    ref={field.ref}
                    id="elasticsearch-auth-type"
                    onBlur={field.onBlur}
                    isError={Boolean(error)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Username/Password</SelectItem>
                    <SelectItem value="api-key">API Key</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name={authType === "user" ? "inputs.auth.username" : "inputs.auth.apiKeyId"}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="elasticsearch-auth-identity">
                  {authType === "user" ? "Username" : "API Key ID"}
                </FieldLabel>
                <Input
                  {...field}
                  id="elasticsearch-auth-identity"
                  autoComplete="off"
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name={authType === "user" ? "inputs.auth.password" : "inputs.auth.apiKey"}
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="elasticsearch-auth-secret">
                  {authType === "user" ? "Password" : "API Key"}
                </FieldLabel>
                <Input
                  {...field}
                  id="elasticsearch-auth-secret"
                  type="password"
                  autoComplete="new-password"
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        </div>
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="elasticsearch-roles"
        presentation="panel"
        surface
        title="Roles"
        description="Assign built-in roles such as superuser, apm_user, kibana_admin, or monitoring_user, or enter a custom role."
      >
        <div className="flex flex-col gap-3">
          {roles.map((_, index) => (
            <Controller
              // Roles are ordered scalar values, so their stable identity is their current index.
              // eslint-disable-next-line react/no-array-index-key
              key={`elasticsearch-role-${index}`}
              control={control}
              name={`inputs.roles.${index}`}
              render={({ field, fieldState: { error } }) => (
                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`elasticsearch-role-${index}`}>Role</FieldLabel>
                    <Input
                      {...field}
                      id={`elasticsearch-role-${index}`}
                      placeholder="superuser"
                      isError={Boolean(error)}
                      aria-describedby={error ? `elasticsearch-role-${index}-error` : undefined}
                    />
                    <FieldError id={`elasticsearch-role-${index}-error`}>
                      {error?.message}
                    </FieldError>
                  </Field>
                  <div className="flex flex-col gap-2">
                    <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                      &nbsp;
                    </FieldLabel>
                    <IconButton
                      type="button"
                      variant="outline"
                      aria-label={`Remove role ${index + 1}`}
                      disabled={roles.length === 1}
                      onClick={() =>
                        setValue(
                          "inputs.roles",
                          roles.filter((__, itemIndex) => itemIndex !== index),
                          { shouldDirty: true }
                        )
                      }
                    >
                      <Trash2Icon />
                    </IconButton>
                  </div>
                </div>
              )}
            />
          ))}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => setValue("inputs.roles", [...roles, ""], { shouldDirty: true })}
          >
            <PlusIcon />
            Add Role
          </Button>
        </div>
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="elasticsearch-advanced"
        presentation="collapse"
        title="Advanced"
      >
        <DynamicSecretProviderFields fields={advancedFields} />
        <SslRejectUnauthorizedField />
      </DynamicSecretProviderGroup>
    </>
  );
};

export const elasticSearchDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.ElasticSearch,
  label: "Elasticsearch",
  customRenderer: {
    reasons: ["conditional-fields", "repeatable-fields"],
    Component: ElasticSearchFields
  },
  create: {
    schema: elasticSearchCreateFormSchema,
    getDefaultValues: getElasticSearchCreateDefaultValues,
    toPayload: getElasticSearchCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: elasticSearchEditFormSchema,
    getDefaultValues: getElasticSearchEditDefaultValues,
    toPayload: getElasticSearchEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});

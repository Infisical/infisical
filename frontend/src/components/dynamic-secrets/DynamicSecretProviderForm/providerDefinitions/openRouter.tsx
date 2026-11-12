import { DynamicSecretProviders, OpenRouterLimitReset } from "@app/hooks/api/dynamicSecret/types";

import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormItem
} from "../types";
import {
  getOpenRouterCreateDefaultValues,
  getOpenRouterCreatePayload,
  getOpenRouterEditDefaultValues,
  getOpenRouterEditPayload,
  OPEN_ROUTER_NO_LIMIT_RESET,
  openRouterCreateFormSchema,
  openRouterEditFormSchema,
  TOpenRouterFormValues
} from "./openRouterContract";

const keySettingsFields = [
  {
    name: "inputs.workspaceId",
    type: "text",
    label: "Workspace ID",
    placeholder: "0df9e665-d932-5740-b2c7-b52af166bc11",
    description: "The OpenRouter workspace to create keys in. Defaults to the default workspace.",
    isOptional: true
  },
  {
    name: "inputs.limit",
    type: "number",
    label: "Credit Limit (USD)",
    placeholder: "No limit",
    min: 0,
    step: "any",
    isOptional: true,
    layout: "half"
  },
  {
    name: "inputs.limitReset",
    type: "select",
    label: "Limit Reset",
    layout: "half",
    options: [
      { label: "Never", value: OPEN_ROUTER_NO_LIMIT_RESET },
      { label: "Daily", value: OpenRouterLimitReset.Daily },
      { label: "Weekly", value: OpenRouterLimitReset.Weekly },
      { label: "Monthly", value: OpenRouterLimitReset.Monthly }
    ]
  },
  {
    name: "inputs.includeByokInLimit",
    type: "switch",
    label: "Include BYOK Usage in Limit",
    description: "Count usage through your own provider keys toward the credit limit."
  }
] satisfies readonly TDynamicSecretProviderField<TOpenRouterFormValues>[];

const advancedFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Key Name Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    description: "Name given to each API key in OpenRouter."
  }
] satisfies readonly TDynamicSecretProviderField<TOpenRouterFormValues>[];

const getFields = (mode: "create" | "edit") =>
  [
    {
      kind: "group",
      id: "openrouter-configuration",
      presentation: "panel",
      fields: [
        {
          name: "inputs.managementKey",
          type: "secret",
          label: "Management Key",
          placeholder: mode === "edit" ? "••••••••" : "sk-or-v1-...",
          autoComplete: "new-password",
          ...(mode === "edit"
            ? { isOptional: true, description: "Leave blank to keep the current management key." }
            : {
                description:
                  "An OpenRouter management API key. Infisical uses it to create and delete the API key for each lease."
              })
        },
        ...keySettingsFields
      ]
    },
    {
      kind: "group",
      id: "openrouter-advanced",
      presentation: "collapse",
      title: "Advanced",
      fields: advancedFields
    }
  ] satisfies readonly TDynamicSecretProviderFormItem<TOpenRouterFormValues>[];

const noRenewalTtlDescription =
  "OpenRouter keys expire at the end of the lease and cannot be renewed.";

export const openRouterDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.OpenRouter,
  label: "OpenRouter",
  create: {
    schema: openRouterCreateFormSchema,
    getDefaultValues: getOpenRouterCreateDefaultValues,
    toPayload: getOpenRouterCreatePayload,
    fields: getFields("create"),
    commonFields: { ttlDescription: noRenewalTtlDescription },
    submitLabel: "Submit"
  },
  edit: {
    schema: openRouterEditFormSchema,
    getDefaultValues: getOpenRouterEditDefaultValues,
    toPayload: getOpenRouterEditPayload,
    fields: getFields("edit"),
    commonFields: { ttlDescription: noRenewalTtlDescription },
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

import {
  getOpenRouterCreateDefaultValues,
  getOpenRouterCreatePayload,
  getOpenRouterEditDefaultValues,
  getOpenRouterEditPayload,
  OPEN_ROUTER_NO_LIMIT_RESET,
  openRouterCreateFormSchema,
  openRouterEditFormSchema,
  type TOpenRouterFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/openRouterContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { DynamicSecretProviders, OpenRouterLimitReset } from "@app/hooks/api/dynamicSecret/types";

import { ProviderFields, ProviderGroup, usernameTemplateFieldDefinition } from "../fields";
import { type DynamicSecretRendererProps, defineFlowProvider } from "../types";

type TOpenRouterField = TDynamicSecretProviderField<TOpenRouterFormValues>;

const createKeyField: TOpenRouterField = {
  name: "inputs.managementKey",
  type: "secret",
  label: "Management Key",
  placeholder: "sk-or-v1-...",
  autoComplete: "new-password",
  description:
    "An OpenRouter management API key. Infisical uses it to create and delete the API key for each lease."
};

const editKeyField: TOpenRouterField = {
  name: "inputs.managementKey",
  type: "secret",
  label: "Management Key",
  placeholder: "••••••••",
  autoComplete: "new-password",
  isOptional: true,
  description: "Leave blank to keep the current management key."
};

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
    type: "text",
    label: "Credit Limit (USD)",
    placeholder: "No limit",
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
] satisfies readonly TOpenRouterField[];

const advancedFields = [
  {
    ...usernameTemplateFieldDefinition,
    label: "Key Name Template",
    description: "Name given to each API key in OpenRouter."
  }
] satisfies readonly TOpenRouterField[];

function OpenRouterFields({ mode }: DynamicSecretRendererProps) {
  return (
    <>
      <ProviderGroup id="openrouter-configuration">
        <ProviderFields
          fields={[mode === "edit" ? editKeyField : createKeyField, ...keySettingsFields]}
        />
      </ProviderGroup>
      <ProviderGroup id="openrouter-advanced" presentation="collapse" title="Advanced">
        <ProviderFields fields={advancedFields} />
      </ProviderGroup>
    </>
  );
}

const commonFields = {
  ttlDescription: "OpenRouter keys expire at the end of the lease and cannot be renewed."
};

export const openRouterFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.OpenRouter,
  label: "OpenRouter",
  schema: openRouterCreateFormSchema,
  getDefaultValues: getOpenRouterCreateDefaultValues,
  toPayload: getOpenRouterCreatePayload,
  Renderer: OpenRouterFields,
  commonFields,
  submitLabel: "Submit",
  edit: {
    schema: openRouterEditFormSchema,
    getDefaultValues: getOpenRouterEditDefaultValues,
    toPayload: getOpenRouterEditPayload,
    Renderer: OpenRouterFields,
    commonFields,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

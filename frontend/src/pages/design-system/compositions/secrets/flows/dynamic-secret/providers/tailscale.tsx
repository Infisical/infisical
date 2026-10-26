import { useFormContext } from "react-hook-form";

import {
  getTailscaleCreateDefaultValues,
  getTailscaleCreatePayload,
  tailscaleCreateFormSchema,
  TTailscaleFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/tailscaleContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import {
  DynamicSecretProviders,
  TailscaleAuthMethod,
  TailscaleKeyAuthType
} from "@app/hooks/api/dynamicSecret/types";

import { ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

type TTailscaleField = TDynamicSecretProviderField<TTailscaleFormValues>;

const methodField: TTailscaleField = {
  name: "inputs.auth.method",
  type: "select",
  label: "Authentication Method",
  options: [
    { label: "API Key", value: TailscaleAuthMethod.ApiKey },
    { label: "OAuth", value: TailscaleAuthMethod.OAuth }
  ]
};

const commonFields = [
  {
    name: "inputs.authType",
    type: "select",
    label: "Key Type",
    options: [
      { label: "Auth Keys", value: TailscaleKeyAuthType.AuthKeys },
      { label: "OAuth Keys", value: TailscaleKeyAuthType.OAuthKeys },
      { label: "Federated Keys", value: TailscaleKeyAuthType.FederatedKeys }
    ]
  },
  {
    name: "inputs.tailnet",
    type: "text",
    label: "Tailnet",
    placeholder: "example.com or -",
    description: "Use '-' for the token owner's default tailnet, or provide a tailnet name."
  },
  {
    name: "inputs.description",
    type: "text",
    label: "Description",
    placeholder: "Infisical dynamic access",
    isOptional: true
  },
  {
    name: "inputs.tags",
    type: "text",
    label: "Tags",
    placeholder: "tag:ci,tag:prod",
    isOptional: true,
    description: "Comma-separated ACL tags (for example, tag:ci, tag:prod)."
  }
] satisfies readonly TTailscaleField[];

const apiKeyFields = [
  {
    name: "inputs.auth.apiKey",
    type: "secret",
    label: "API Key",
    placeholder: "tskey-api-...",
    autoComplete: "new-password"
  }
] satisfies readonly TTailscaleField[];

const oauthFields = [
  {
    name: "inputs.auth.clientId",
    type: "text",
    label: "Client ID",
    placeholder: "Enter OAuth client ID",
    layout: "half"
  },
  {
    name: "inputs.auth.clientSecret",
    type: "secret",
    label: "Client Secret",
    placeholder: "Enter OAuth client secret",
    autoComplete: "new-password",
    layout: "half"
  }
] satisfies readonly TTailscaleField[];

const scopesFields = [
  {
    name: "inputs.scopes",
    type: "text",
    label: "Scopes",
    placeholder: "devices:core,users:read",
    description: "Comma-separated OAuth scopes."
  }
] satisfies readonly TTailscaleField[];

const federatedFields = [
  {
    name: "inputs.issuer",
    type: "text",
    label: "Issuer",
    placeholder: "https://issuer.example.com",
    description: "HTTPS URL of the OIDC issuer trusted for token exchange."
  },
  {
    name: "inputs.subject",
    type: "text",
    label: "Subject",
    placeholder: "service-account@example.com"
  },
  {
    name: "inputs.audience",
    type: "text",
    label: "Audience",
    placeholder: "tailscale",
    isOptional: true
  }
] satisfies readonly TTailscaleField[];

const authKeyFields = [
  {
    name: "inputs.reusable",
    type: "switch",
    label: "Reusable",
    description: "Allow this auth key to be used more than once."
  },
  {
    name: "inputs.preauthorized",
    type: "switch",
    label: "Preauthorized",
    description: "Authorize devices without an approval step."
  }
] satisfies readonly TTailscaleField[];

function TailscaleFields() {
  const { watch } = useFormContext<TTailscaleFormValues>();
  const authMethod = watch("inputs.auth.method");
  const authType = watch("inputs.authType");

  return (
    <ProviderGroup id="tailscale-configuration">
      <ProviderFields
        fields={[
          methodField,
          ...(authMethod === TailscaleAuthMethod.ApiKey ? apiKeyFields : oauthFields),
          ...commonFields
        ]}
      />
      {authType !== TailscaleKeyAuthType.AuthKeys && <ProviderFields fields={scopesFields} />}
      {authType === TailscaleKeyAuthType.FederatedKeys && (
        <ProviderFields fields={federatedFields} />
      )}
      {authType === TailscaleKeyAuthType.AuthKeys && <ProviderFields fields={authKeyFields} />}
    </ProviderGroup>
  );
}

export const tailscaleFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Tailscale,
  label: "Tailscale",
  schema: tailscaleCreateFormSchema,
  getDefaultValues: getTailscaleCreateDefaultValues,
  toPayload: getTailscaleCreatePayload,
  Renderer: TailscaleFields,
  submitLabel: "Submit"
});

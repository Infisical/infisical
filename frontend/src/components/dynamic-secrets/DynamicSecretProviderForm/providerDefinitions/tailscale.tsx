import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldFeedback,
  FieldTitle,
  Switch
} from "@app/components/v3";
import {
  DynamicSecretProviders,
  TailscaleAuthMethod,
  TailscaleKeyAuthType
} from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { defineDynamicSecretProvider, TDynamicSecretProviderField } from "../types";
import {
  getTailscaleCreateDefaultValues,
  getTailscaleCreatePayload,
  getTailscaleEditDefaultValues,
  getTailscaleEditPayload,
  tailscaleCreateFormSchema,
  tailscaleEditFormSchema,
  TTailscaleFormValues
} from "./tailscaleContract";

const TailscaleFields = () => {
  const { control, watch } = useFormContext<TTailscaleFormValues>();
  const authMethod = watch("inputs.auth.method");
  const authType = watch("inputs.authType");
  const common = [
    {
      name: "inputs.auth.method",
      type: "select",
      label: "Authentication Method",
      options: [
        { label: "API Key", value: TailscaleAuthMethod.ApiKey },
        { label: "OAuth", value: TailscaleAuthMethod.OAuth }
      ]
    },
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
      description: "Use '-' for the token owner's default tailnet, or provide a tailnet name."
    },
    { name: "inputs.description", type: "text", label: "Description", isOptional: true },
    {
      name: "inputs.tags",
      type: "text",
      label: "Tags",
      isOptional: true,
      description: "Comma-separated ACL tags (for example, tag:ci, tag:prod)."
    }
  ] satisfies readonly TDynamicSecretProviderField<TTailscaleFormValues>[];
  const authFields =
    authMethod === TailscaleAuthMethod.ApiKey
      ? ([
          {
            name: "inputs.auth.apiKey",
            type: "secret",
            label: "API Key",
            autoComplete: "new-password"
          }
        ] as const)
      : ([
          { name: "inputs.auth.clientId", type: "text", label: "Client ID", layout: "half" },
          {
            name: "inputs.auth.clientSecret",
            type: "secret",
            label: "Client Secret",
            autoComplete: "new-password",
            layout: "half"
          }
        ] as const);
  return (
    <>
      <DynamicSecretProviderGroup id="tailscale-configuration" presentation="panel">
        <DynamicSecretProviderFields
          fields={
            [
              common[0],
              ...authFields,
              ...common.slice(1)
            ] as readonly TDynamicSecretProviderField<TTailscaleFormValues>[]
          }
        />
        {authType !== TailscaleKeyAuthType.AuthKeys && (
          <DynamicSecretProviderFields
            fields={[
              {
                name: "inputs.scopes",
                type: "text",
                label: "Scopes",
                description: "Comma-separated OAuth scopes."
              }
            ]}
          />
        )}
        {authType === TailscaleKeyAuthType.FederatedKeys && (
          <DynamicSecretProviderFields
            fields={[
              {
                name: "inputs.issuer",
                type: "text",
                label: "Issuer",
                description: "HTTPS URL of the OIDC issuer trusted for token exchange."
              },
              { name: "inputs.subject", type: "text", label: "Subject" },
              { name: "inputs.audience", type: "text", label: "Audience", isOptional: true }
            ]}
          />
        )}
        {authType === TailscaleKeyAuthType.AuthKeys &&
          (["reusable", "preauthorized"] as const).map((key) => (
            <Controller
              key={key}
              control={control}
              name={`inputs.${key}`}
              render={({ field, fieldState: { error } }) => (
                <Field orientation="horizontal" data-invalid={Boolean(error)}>
                  <FieldContent>
                    <FieldTitle>{key === "reusable" ? "Reusable" : "Preauthorized"}</FieldTitle>
                    <FieldFeedback
                      id={`tailscale-${key}-feedback`}
                      description={
                        key === "reusable"
                          ? "Allow this auth key to be used more than once."
                          : "Authorize devices without an approval step."
                      }
                      error={error?.message}
                    />
                  </FieldContent>
                  <Switch
                    ref={field.ref}
                    checked={field.value}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                    aria-label={key === "reusable" ? "Reusable" : "Preauthorized"}
                  />
                </Field>
              )}
            />
          ))}
      </DynamicSecretProviderGroup>
    </>
  );
};

export const tailscaleDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Tailscale,
  label: "Tailscale",
  customRenderer: {
    reasons: ["conditional-fields", "non-scalar-value"],
    Component: TailscaleFields
  },
  create: {
    schema: tailscaleCreateFormSchema,
    getDefaultValues: getTailscaleCreateDefaultValues,
    toPayload: getTailscaleCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: tailscaleEditFormSchema,
    getDefaultValues: getTailscaleEditDefaultValues,
    toPayload: getTailscaleEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

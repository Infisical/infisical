import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormItem
} from "../types";
import {
  cloudflareAccessCreateFormSchema,
  cloudflareAccessEditFormSchema,
  getCloudflareAccessCreateDefaultValues,
  getCloudflareAccessCreatePayload,
  getCloudflareAccessEditDefaultValues,
  getCloudflareAccessEditPayload,
  TCloudflareAccessFormValues
} from "./cloudflareAccessContract";

const tokenSettingsFields = [
  {
    name: "inputs.accountId",
    type: "text",
    label: "Account ID",
    placeholder: "0123456789abcdef0123456789abcdef"
  },
  {
    name: "inputs.tags",
    type: "text",
    label: "Tags",
    placeholder: "pool=agents",
    description:
      "Comma-separated key=value tags set on each service token. Tag values can't contain commas. Add a Service Auth policy with the Service Token Tag selector to admit the tokens."
  }
] satisfies readonly TDynamicSecretProviderField<TCloudflareAccessFormValues>[];

const advancedFields = [
  {
    name: "usernameTemplate",
    type: "text",
    label: "Token Name Template",
    placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    description: "Name given to each service token in Cloudflare."
  }
] satisfies readonly TDynamicSecretProviderField<TCloudflareAccessFormValues>[];

const getFields = (mode: "create" | "edit") =>
  [
    {
      kind: "group",
      id: "cloudflare-access-configuration",
      presentation: "panel",
      fields: [
        {
          name: "inputs.apiToken",
          type: "secret",
          label: "API Token",
          placeholder: mode === "edit" ? "••••••••" : "",
          autoComplete: "new-password",
          ...(mode === "edit"
            ? { isOptional: true, description: "Leave blank to keep the current API token." }
            : {
                description:
                  "A Cloudflare API token with the Access: Service Tokens Write permission on the account."
              })
        },
        ...tokenSettingsFields
      ]
    },
    {
      kind: "group",
      id: "cloudflare-access-advanced",
      presentation: "collapse",
      title: "Advanced",
      fields: advancedFields
    }
  ] satisfies readonly TDynamicSecretProviderFormItem<TCloudflareAccessFormValues>[];

const noRenewalTtlDescription =
  "Service tokens expire at the end of the lease and cannot be renewed.";

export const cloudflareAccessDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.CloudflareAccess,
  label: "Cloudflare Access",
  create: {
    schema: cloudflareAccessCreateFormSchema,
    getDefaultValues: getCloudflareAccessCreateDefaultValues,
    toPayload: getCloudflareAccessCreatePayload,
    fields: getFields("create"),
    commonFields: { ttlDescription: noRenewalTtlDescription },
    submitLabel: "Submit"
  },
  edit: {
    schema: cloudflareAccessEditFormSchema,
    getDefaultValues: getCloudflareAccessEditDefaultValues,
    toPayload: getCloudflareAccessEditPayload,
    fields: getFields("edit"),
    commonFields: { ttlDescription: noRenewalTtlDescription },
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

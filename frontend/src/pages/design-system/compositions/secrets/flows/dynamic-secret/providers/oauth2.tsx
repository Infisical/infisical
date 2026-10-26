import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import {
  getOAuth2CreateDefaultValues,
  getOAuth2CreatePayload,
  OAUTH2_MAX_EXTRA_PARAMS,
  oauth2CreateFormSchema,
  TOAuth2CreateFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/oauth2Contract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { DynamicSecretProviders, OAuth2ClientAuthMethod } from "@app/hooks/api/dynamicSecret/types";

import { fieldError, ProviderFields, ProviderGroup } from "../fields";
import { defineFlowProvider } from "../types";

const connectionFields = [
  {
    name: "inputs.tokenUrl",
    type: "text",
    label: "Token URL",
    placeholder: "https://auth.example.com/oauth2/token",
    description: "The authorization server's OAuth 2.0 token endpoint."
  },
  {
    name: "inputs.revocationUrl",
    type: "text",
    label: "Revocation URL",
    placeholder: "https://auth.example.com/oauth2/revoke",
    description:
      "The RFC 7009 endpoint Infisical calls to revoke each lease's access token when the lease ends."
  },
  {
    name: "inputs.clientAuth.method",
    type: "select",
    label: "Client Authentication",
    description:
      "How Infisical sends the client credentials to the token and revocation endpoints.",
    options: [
      { label: "HTTP Basic Header", value: OAuth2ClientAuthMethod.ClientSecretBasic },
      { label: "Request Body", value: OAuth2ClientAuthMethod.ClientSecretPost }
    ]
  },
  {
    name: "inputs.clientId",
    type: "text",
    label: "Client ID",
    placeholder: "Enter OAuth 2.0 client ID",
    layout: "half"
  },
  {
    name: "inputs.clientAuth.clientSecret",
    type: "secret",
    label: "Client Secret",
    placeholder: "Enter OAuth 2.0 client secret",
    autoComplete: "new-password",
    layout: "half"
  },
  {
    name: "inputs.scope",
    type: "text",
    label: "Scope",
    placeholder: "read:orders write:orders",
    isOptional: true,
    description: "Space-separated scopes. Leave blank to use the client's default scopes."
  }
] satisfies readonly TDynamicSecretProviderField<TOAuth2CreateFormValues>[];

function OAuth2Fields() {
  const { control } = useFormContext<TOAuth2CreateFormValues>();
  const extraParams = useFieldArray({ control, name: "inputs.extraParams" });

  return (
    <>
      <ProviderGroup id="oauth2-configuration">
        <ProviderFields fields={connectionFields} />
      </ProviderGroup>

      <ProviderGroup
        id="oauth2-extra-params"
        surface
        title="Extra Parameters"
        description="Additional form parameters sent with the token request, such as audience or resource."
      >
        <Stack gap={12} align="start">
          {extraParams.fields.map(({ id }, index) => (
            <div key={id} className="flex w-full items-end gap-3">
              <div className="grid flex-1 grid-cols-2 gap-3">
                {(["key", "value"] as const).map((part) => (
                  <Controller
                    key={part}
                    control={control}
                    name={`inputs.extraParams.${index}.${part}`}
                    render={({ field, fieldState: { error } }) => (
                      <Field label={part === "key" ? "Name" : "Value"} error={fieldError(error)}>
                        <Input
                          {...field}
                          placeholder={part === "key" ? "audience" : "https://api.example.com"}
                          invalid={Boolean(error)}
                        />
                      </Field>
                    )}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                icon="trash"
                iconOnly
                aria-label={`Remove parameter ${index + 1}`}
                onClick={() => extraParams.remove(index)}
              >
                Remove parameter {index + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            type="button"
            size="sm"
            icon="plus"
            disabled={extraParams.fields.length >= OAUTH2_MAX_EXTRA_PARAMS}
            onClick={() => extraParams.append({ key: "", value: "" })}
          >
            Add Parameter
          </Button>
        </Stack>
      </ProviderGroup>
    </>
  );
}

export const oauth2FlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.OAuth2,
  label: "OAuth 2.0",
  schema: oauth2CreateFormSchema,
  getDefaultValues: getOAuth2CreateDefaultValues,
  toPayload: getOAuth2CreatePayload,
  Renderer: OAuth2Fields,
  commonFields: {
    ttlDescription:
      "TTLs must fit within the token lifetime the authorization server sets. They aren't checked if the server doesn't report a lifetime."
  },
  submitLabel: "Submit"
});

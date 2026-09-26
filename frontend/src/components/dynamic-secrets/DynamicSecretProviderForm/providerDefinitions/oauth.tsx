import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button, Field, FieldError, FieldLabel, IconButton, Input } from "@app/components/v3";
import { DynamicSecretProviders, OAuthClientAuthMethod } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderCommonFields,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps
} from "../types";
import {
  getOAuthCreateDefaultValues,
  getOAuthCreatePayload,
  getOAuthEditDefaultValues,
  getOAuthEditPayload,
  OAUTH_CUSTOM_RENDERER_REASONS,
  OAUTH_MAX_EXTRA_PARAMS,
  oauthCreateFormSchema,
  oauthEditFormSchema,
  TOAuthEditFormValues
} from "./oauthContract";

const getConnectionFields = (mode: TDynamicSecretProviderRendererProps["mode"]) =>
  [
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
        {
          label: "HTTP Basic Header",
          value: OAuthClientAuthMethod.ClientSecretBasic
        },
        {
          label: "Request Body",
          value: OAuthClientAuthMethod.ClientSecretPost
        }
      ]
    },
    {
      name: "inputs.clientId",
      type: "text",
      label: "Client ID",
      placeholder: "Enter OAuth client ID",
      layout: "half"
    },
    {
      name: "inputs.clientAuth.clientSecret",
      type: "secret",
      label: "Client Secret",
      placeholder: mode === "edit" ? "••••••••" : "Enter OAuth client secret",
      autoComplete: "new-password",
      layout: "half",
      ...(mode === "edit"
        ? { isOptional: true, description: "Leave blank to keep the current client secret." }
        : {})
    },
    {
      name: "inputs.scope",
      type: "text",
      label: "Scope",
      placeholder: "read:orders write:orders",
      isOptional: true,
      description: "Space-separated scopes. Leave blank to use the client's default scopes."
    }
  ] satisfies readonly TDynamicSecretProviderField<TOAuthEditFormValues>[];

const OAuthFields = ({ mode }: TDynamicSecretProviderRendererProps) => {
  const { control } = useFormContext<TOAuthEditFormValues>();
  const extraParams = useFieldArray({ control, name: "inputs.extraParams" });

  return (
    <>
      <DynamicSecretProviderGroup id="oauth-configuration" presentation="panel">
        <DynamicSecretProviderFields<TOAuthEditFormValues> fields={getConnectionFields(mode)} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="oauth-extra-params"
        presentation="panel"
        surface
        title="Extra Parameters"
        description="Additional form parameters sent with the token request, such as audience or resource."
      >
        <div className="flex flex-col gap-3">
          {extraParams.fields.map(({ id }, index) => (
            <div
              key={id}
              className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              {(["key", "value"] as const).map((part) => (
                <Controller
                  key={part}
                  control={control}
                  name={`inputs.extraParams.${index}.${part}`}
                  render={({ field, fieldState: { error } }) => {
                    const inputId = `oauth-extra-param-${index}-${part}`;
                    const errorId = `${inputId}-error`;

                    return (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={inputId}>
                          {part === "key" ? "Name" : "Value"}
                        </FieldLabel>
                        <Input
                          {...field}
                          id={inputId}
                          placeholder={part === "key" ? "audience" : "https://api.example.com"}
                          isError={Boolean(error)}
                          aria-describedby={error ? errorId : undefined}
                        />
                        {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
                      </Field>
                    );
                  }}
                />
              ))}
              <div className="flex flex-col gap-2">
                <FieldLabel className="pointer-events-none invisible select-none" aria-hidden>
                  &nbsp;
                </FieldLabel>
                <IconButton
                  type="button"
                  variant="outline"
                  aria-label={`Remove parameter ${index + 1}`}
                  onClick={() => extraParams.remove(index)}
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
            isDisabled={extraParams.fields.length >= OAUTH_MAX_EXTRA_PARAMS}
            onClick={() => extraParams.append({ key: "", value: "" })}
          >
            <PlusIcon />
            Add Parameter
          </Button>
        </div>
      </DynamicSecretProviderGroup>
    </>
  );
};

const oauthCommonFields: TDynamicSecretProviderCommonFields = {
  ttlDescription:
    "TTLs must fit within the token lifetime the authorization server sets. They aren't checked if the server doesn't report a lifetime."
};

export const oauthDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.OAuth,
  label: "OAuth 2.0",
  customRenderer: {
    reasons: OAUTH_CUSTOM_RENDERER_REASONS,
    Component: OAuthFields
  },
  create: {
    schema: oauthCreateFormSchema,
    getDefaultValues: getOAuthCreateDefaultValues,
    toPayload: getOAuthCreatePayload,
    commonFields: oauthCommonFields,
    submitLabel: "Submit"
  },
  edit: {
    schema: oauthEditFormSchema,
    getDefaultValues: getOAuthEditDefaultValues,
    toPayload: getOAuthEditPayload,
    commonFields: oauthCommonFields,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

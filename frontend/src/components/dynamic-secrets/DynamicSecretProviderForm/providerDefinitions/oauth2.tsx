import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button, Field, FieldError, FieldLabel, IconButton, Input } from "@app/components/v3";
import { DynamicSecretProviders, OAuth2ClientAuthMethod } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderCommonFields,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps
} from "../types";
import {
  getOAuth2CreateDefaultValues,
  getOAuth2CreatePayload,
  getOAuth2EditDefaultValues,
  getOAuth2EditPayload,
  OAUTH2_CUSTOM_RENDERER_REASONS,
  OAUTH2_MAX_EXTRA_PARAMS,
  oauth2CreateFormSchema,
  oauth2EditFormSchema,
  TOAuth2EditFormValues
} from "./oauth2Contract";

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
          value: OAuth2ClientAuthMethod.ClientSecretBasic
        },
        {
          label: "Request Body",
          value: OAuth2ClientAuthMethod.ClientSecretPost
        }
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
      placeholder: mode === "edit" ? "••••••••" : "Enter OAuth 2.0 client secret",
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
  ] satisfies readonly TDynamicSecretProviderField<TOAuth2EditFormValues>[];

const OAuth2Fields = ({ mode }: TDynamicSecretProviderRendererProps) => {
  const { control } = useFormContext<TOAuth2EditFormValues>();
  const extraParams = useFieldArray({ control, name: "inputs.extraParams" });

  return (
    <>
      <DynamicSecretProviderGroup id="oauth2-configuration" presentation="panel">
        <DynamicSecretProviderFields<TOAuth2EditFormValues> fields={getConnectionFields(mode)} />
      </DynamicSecretProviderGroup>

      <DynamicSecretProviderGroup
        id="oauth2-extra-params"
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
                    const inputId = `oauth2-extra-param-${index}-${part}`;
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
            isDisabled={extraParams.fields.length >= OAUTH2_MAX_EXTRA_PARAMS}
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

const oauth2CommonFields: TDynamicSecretProviderCommonFields = {
  ttlDescription:
    "TTLs must fit within the token lifetime the authorization server sets. They aren't checked if the server doesn't report a lifetime."
};

export const oauth2DynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.OAuth2,
  label: "OAuth 2.0",
  customRenderer: {
    reasons: OAUTH2_CUSTOM_RENDERER_REASONS,
    Component: OAuth2Fields
  },
  create: {
    schema: oauth2CreateFormSchema,
    getDefaultValues: getOAuth2CreateDefaultValues,
    toPayload: getOAuth2CreatePayload,
    commonFields: oauth2CommonFields,
    submitLabel: "Submit"
  },
  edit: {
    schema: oauth2EditFormSchema,
    getDefaultValues: getOAuth2EditDefaultValues,
    toPayload: getOAuth2EditPayload,
    commonFields: oauth2CommonFields,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

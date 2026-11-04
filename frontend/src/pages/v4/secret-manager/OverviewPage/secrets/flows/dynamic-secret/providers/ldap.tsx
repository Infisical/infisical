import { Controller, useFormContext } from "react-hook-form";

import {
  getLdapCreateDefaultValues,
  getLdapCreatePayload,
  getLdapEditDefaultValues,
  getLdapEditPayload,
  ldapCreateFormSchema,
  LdapCredentialType,
  ldapEditFormSchema,
  TLdapCreateFormValues
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/providerDefinitions/ldapContract";
import type { TDynamicSecretProviderField } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import { Field } from "@app/components/v4/ui/field";
import { Select } from "@app/components/v4/ui/select";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  fieldError,
  ProviderFields,
  ProviderGroup,
  SslRejectUnauthorizedField,
  usernameTemplateFieldDefinition
} from "../fields";
import { defineFlowProvider } from "../types";

const connectionFields = [
  {
    name: "inputs.url",
    type: "text",
    label: "URL",
    placeholder: "ldaps://ldap.example.com:636"
  },
  {
    name: "inputs.binddn",
    type: "text",
    label: "Bind DN",
    placeholder: "cn=admin,dc=example,dc=com",
    layout: "half"
  },
  {
    name: "inputs.bindpass",
    type: "secret",
    label: "Bind Password",
    placeholder: "Enter bind password",
    layout: "half",
    autoComplete: "new-password"
  },
  {
    name: "inputs.ca",
    type: "textarea",
    label: "CA",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true
  }
] satisfies readonly TDynamicSecretProviderField<TLdapCreateFormValues>[];

const dynamicLdifFields = [
  { name: "inputs.creationLdif", type: "textarea", label: "Creation LDIF" },
  { name: "inputs.revocationLdif", type: "textarea", label: "Revocation LDIF" },
  { name: "inputs.rollbackLdif", type: "textarea", label: "Rollback LDIF", isOptional: true }
] satisfies readonly TDynamicSecretProviderField<TLdapCreateFormValues>[];

const staticLdifFields = [
  { name: "inputs.rotationLdif", type: "textarea", label: "Rotation LDIF" }
] satisfies readonly TDynamicSecretProviderField<TLdapCreateFormValues>[];

function LdapFields() {
  const { control, setValue, watch } = useFormContext<TLdapCreateFormValues>();
  const credentialType = watch("inputs.credentialType");

  return (
    <>
      <ProviderGroup id="ldap-connection">
        <ProviderFields fields={connectionFields} />
        <SslRejectUnauthorizedField<TLdapCreateFormValues> />
      </ProviderGroup>
      <ProviderGroup id="ldap-configuration">
        <Controller
          control={control}
          name="inputs.credentialType"
          render={({ field, fieldState: { error } }) => (
            <Field wide label="Credential Type" error={fieldError(error)}>
              <Select
                value={field.value}
                invalid={Boolean(error)}
                options={[
                  { value: LdapCredentialType.Dynamic, label: "Dynamic" },
                  { value: LdapCredentialType.Static, label: "Static" }
                ]}
                onValueChange={(value) => {
                  if (!value || value === field.value) return;
                  field.onChange(value);
                  if (value === LdapCredentialType.Dynamic) setValue("inputs.rotationLdif", "");
                  else {
                    setValue("inputs.creationLdif", "");
                    setValue("inputs.revocationLdif", "");
                    setValue("inputs.rollbackLdif", "");
                  }
                }}
              />
            </Field>
          )}
        />
        <ProviderFields
          fields={
            credentialType === LdapCredentialType.Dynamic ? dynamicLdifFields : staticLdifFields
          }
        />
        <ProviderFields<TLdapCreateFormValues> fields={[usernameTemplateFieldDefinition]} />
      </ProviderGroup>
    </>
  );
}

export const ldapFlowProvider = defineFlowProvider({
  provider: DynamicSecretProviders.Ldap,
  label: "LDAP",
  schema: ldapCreateFormSchema,
  getDefaultValues: getLdapCreateDefaultValues,
  toPayload: getLdapCreatePayload,
  Renderer: LdapFields,
  submitLabel: "Submit",
  edit: {
    schema: ldapEditFormSchema,
    getDefaultValues: getLdapEditDefaultValues,
    toPayload: getLdapEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldFeedback,
  FieldLabel,
  FieldTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from "@app/components/v3";
import { ProjectPermissionSub, useProject } from "@app/context";
import { useCanUseProjectAppConnectionImport } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import type { VaultLdapRole } from "@app/hooks/api/migration/types";

import { VaultLdapImportModal } from "../../CreateDynamicSecretForm/VaultLdapImportModal";
import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps
} from "../types";
import {
  getLdapCreateDefaultValues,
  getLdapCreatePayload,
  getLdapEditDefaultValues,
  getLdapEditPayload,
  getLdapVaultImportValues,
  ldapCreateFormSchema,
  LdapCredentialType,
  ldapEditFormSchema,
  TLdapFormValues
} from "./ldapContract";

const LdapFields = ({ mode }: TDynamicSecretProviderRendererProps) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { projectId } = useProject();
  const canImport = useCanUseProjectAppConnectionImport(ProjectPermissionSub.Secrets);
  const { data: connections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: mode === "create" && canImport }
  );
  const { control, reset, setValue, watch } = useFormContext<TLdapFormValues>();
  const credentialType = watch("inputs.credentialType");
  const common = [
    { name: "inputs.url", type: "text", label: "URL" },
    { name: "inputs.binddn", type: "text", label: "Bind DN", layout: "half" },
    {
      name: "inputs.bindpass",
      type: "secret",
      label: "Bind Password",
      layout: "half",
      autoComplete: "new-password"
    },
    { name: "inputs.ca", type: "textarea", label: "CA", isOptional: true }
  ] satisfies readonly TDynamicSecretProviderField<TLdapFormValues>[];
  const handleImport = (role: VaultLdapRole) => {
    try {
      reset({
        ...watch(),
        ...getLdapVaultImportValues(role),
        inputs: { ...watch("inputs"), ...getLdapVaultImportValues(role).inputs }
      });
      createNotification({
        type: "info",
        text: "Configuration loaded successfully from HashiCorp Vault"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to load configuration from HashiCorp Vault"
      });
    }
  };
  return (
    <>
      {mode === "create" && canImport && connections.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-info/20 bg-info/10 p-3">
          <div className="flex items-center gap-2 text-sm">
            <InfoIcon className="size-4 text-info" />
            Load values from HashiCorp Vault.
          </div>
          <Button type="button" size="sm" variant="info" onClick={() => setIsImportOpen(true)}>
            Load from Vault
          </Button>
        </div>
      )}
      <DynamicSecretProviderGroup id="ldap-connection" presentation="panel">
        <DynamicSecretProviderFields fields={common} />
        <Controller
          control={control}
          name="inputs.sslRejectUnauthorized"
          render={({ field, fieldState: { error } }) => (
            <Field orientation="horizontal" data-invalid={Boolean(error)}>
              <FieldContent>
                <FieldTitle>SSL Reject Unauthorized</FieldTitle>
                <FieldFeedback
                  id="ldap-ssl-reject-feedback"
                  description="Verify the server certificate against the supplied certificate authorities."
                  error={error?.message}
                />
              </FieldContent>
              <Switch
                ref={field.ref}
                checked={field.value}
                onBlur={field.onBlur}
                onCheckedChange={field.onChange}
                aria-label="SSL Reject Unauthorized"
              />
            </Field>
          )}
        />
      </DynamicSecretProviderGroup>
      <DynamicSecretProviderGroup id="ldap-configuration" presentation="panel">
        <Controller
          control={control}
          name="inputs.credentialType"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="ldap-credential-type">Credential Type</FieldLabel>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  // Radix Select can emit a spurious empty onValueChange while options mount.
                  if (!value || value === field.value) return;
                  field.onChange(value);
                  if (value === LdapCredentialType.Dynamic) setValue("inputs.rotationLdif", "");
                  else {
                    setValue("inputs.creationLdif", "");
                    setValue("inputs.revocationLdif", "");
                    setValue("inputs.rollbackLdif", "");
                  }
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id="ldap-credential-type"
                  onBlur={field.onBlur}
                  isError={Boolean(error)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LdapCredentialType.Dynamic}>Dynamic</SelectItem>
                  <SelectItem value={LdapCredentialType.Static}>Static</SelectItem>
                </SelectContent>
              </Select>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        {credentialType === LdapCredentialType.Dynamic ? (
          <DynamicSecretProviderFields
            fields={[
              { name: "inputs.creationLdif", type: "textarea", label: "Creation LDIF" },
              { name: "inputs.revocationLdif", type: "textarea", label: "Revocation LDIF" },
              {
                name: "inputs.rollbackLdif",
                type: "textarea",
                label: "Rollback LDIF",
                isOptional: true
              },
              {
                name: "usernameTemplate",
                type: "text",
                label: "Username Template",
                placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
              }
            ]}
          />
        ) : (
          <DynamicSecretProviderFields
            fields={[{ name: "inputs.rotationLdif", type: "textarea", label: "Rotation LDIF" }]}
          />
        )}
      </DynamicSecretProviderGroup>
      <VaultLdapImportModal
        isOpen={isImportOpen}
        onOpenChange={setIsImportOpen}
        appConnections={connections}
        onImport={handleImport}
      />
    </>
  );
};
export const ldapDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Ldap,
  label: "LDAP",
  customRenderer: {
    reasons: ["conditional-fields", "import-workflow", "remote-options"],
    Component: LdapFields
  },
  create: {
    schema: ldapCreateFormSchema,
    getDefaultValues: getLdapCreateDefaultValues,
    toPayload: getLdapCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: ldapEditFormSchema,
    getDefaultValues: getLdapEditDefaultValues,
    toPayload: getLdapEditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

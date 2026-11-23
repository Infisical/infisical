import { useFormContext } from "react-hook-form";

import { CodeBlock, CopyButton, FieldDescription } from "@app/components/v3";
import {
  DynamicSecretProviders,
  NamespaceAuthType,
  TDynamicSecretOidcFederation
} from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps,
  TEditDynamicSecretProviderFormContext
} from "../types";
import {
  getNamespaceCreateDefaultValues,
  getNamespaceCreatePayload,
  getNamespaceEditDefaultValues,
  getNamespaceEditPayload,
  NAMESPACE_CUSTOM_RENDERER_REASONS,
  NAMESPACE_DEFAULT_AUDIENCE,
  namespaceCreateFormSchema,
  namespaceEditFormSchema,
  namespaceTrustRelationshipCommand,
  TNamespaceFormValues
} from "./namespaceContract";

const methodField = {
  name: "inputs.method",
  type: "select",
  label: "Authentication",
  options: [
    { label: "OpenID Connect (Federation)", value: NamespaceAuthType.Federation },
    { label: "Provisioner Token", value: NamespaceAuthType.ProvisionerToken }
  ]
} satisfies TDynamicSecretProviderField<TNamespaceFormValues>;

const tenantIdField = {
  name: "inputs.tenantId",
  type: "text",
  label: "Tenant ID",
  placeholder: "tenant_...",
  description: "The Namespace tenant whose ingress the client certificates are for."
} satisfies TDynamicSecretProviderField<TNamespaceFormValues>;

const audienceField = {
  name: "inputs.audience",
  type: "text",
  label: "Audience",
  placeholder: NAMESPACE_DEFAULT_AUDIENCE,
  isOptional: true,
  description:
    "The audience of the token Infisical presents to Namespace. Change it only if your trust relationship uses another."
} satisfies TDynamicSecretProviderField<TNamespaceFormValues>;

const CopyableValue = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs text-accent">{label}</span>
    <div className="flex items-start gap-2 rounded-md border border-border bg-container py-2 pr-2 pl-3">
      <code className="min-w-0 grow font-mono text-xs leading-5 break-all text-foreground">
        {value}
      </code>
      <CopyButton value={value} ariaLabel={`Copy ${label}`} />
    </div>
  </div>
);

const NamespaceTrustRelationship = ({
  oidcFederation
}: {
  oidcFederation: TDynamicSecretOidcFederation;
}) => (
  <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
    <span className="text-sm font-medium">Namespace Trust Relationship</span>
    <p className="text-xs leading-normal text-accent">
      Add a trust relationship with these values to the Namespace tenant. Leases fail until it
      exists.
    </p>
    {oidcFederation.issuerUrl ? (
      <CopyableValue label="Issuer URL" value={oidcFederation.issuerUrl} />
    ) : (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-accent">Issuer URL</span>
        <p className="text-xs leading-normal text-danger">
          The issuer is unavailable because this instance&apos;s site URL (SITE_URL) is not set. Set
          it to the instance&apos;s public URL.
        </p>
      </div>
    )}
    <CopyableValue label="Subject" value={oidcFederation.subject} />
    <CopyableValue label="Audience" value={oidcFederation.audience} />
    {oidcFederation.issuerUrl && (
      <CodeBlock label="Command" value={namespaceTrustRelationshipCommand(oidcFederation)} />
    )}
  </div>
);

const NamespaceFields = ({ mode, context }: TDynamicSecretProviderRendererProps) => {
  const { watch } = useFormContext<TNamespaceFormValues>();
  const method = watch("inputs.method");
  const hasStoredProvisionerToken = watch("inputs.hasStoredProvisionerToken");
  const audience = watch("inputs.audience");
  const keepsStoredToken = mode === "edit" && hasStoredProvisionerToken;
  const isFederation = method === NamespaceAuthType.Federation;
  const savedOidcFederation =
    mode === "edit"
      ? (context as TEditDynamicSecretProviderFormContext).dynamicSecret.oidcFederation
      : null;
  const oidcFederation = savedOidcFederation && {
    ...savedOidcFederation,
    audience: audience || NAMESPACE_DEFAULT_AUDIENCE
  };

  return (
    <>
      <DynamicSecretProviderGroup id="namespace-configuration" presentation="panel">
        <DynamicSecretProviderFields fields={[methodField]} />
        {isFederation ? (
          <>
            <DynamicSecretProviderFields fields={[tenantIdField]} />
            {mode === "create" && (
              <FieldDescription>
                After you save, edit the dynamic secret to see the issuer URL, subject, and audience
                to add to a Namespace trust relationship.
              </FieldDescription>
            )}
          </>
        ) : (
          <DynamicSecretProviderFields
            fields={[
              {
                name: "inputs.provisionerToken",
                type: "secret",
                label: "Provisioner Token",
                placeholder: keepsStoredToken ? "••••••••" : "nsrt_...",
                autoComplete: "new-password",
                ...(keepsStoredToken
                  ? { isOptional: true, description: "Leave blank to keep the current token." }
                  : {
                      description:
                        "A Namespace revokable token. Infisical uses it to create and revoke a child token for each lease."
                    })
              }
            ]}
          />
        )}
      </DynamicSecretProviderGroup>
      {isFederation && oidcFederation && (
        <NamespaceTrustRelationship oidcFederation={oidcFederation} />
      )}
      {isFederation && (
        <DynamicSecretProviderGroup
          id="namespace-advanced"
          presentation="collapse"
          title="Advanced"
        >
          <DynamicSecretProviderFields fields={[audienceField]} />
        </DynamicSecretProviderGroup>
      )}
    </>
  );
};

const ttlDescription =
  "Each lease's client certificate expires at the end of the lease and cannot be renewed. With OpenID Connect, use 24h or less.";

export const namespaceDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Namespace,
  label: "Namespace",
  customRenderer: {
    reasons: NAMESPACE_CUSTOM_RENDERER_REASONS,
    Component: NamespaceFields
  },
  create: {
    schema: namespaceCreateFormSchema,
    getDefaultValues: getNamespaceCreateDefaultValues,
    toPayload: getNamespaceCreatePayload,
    commonFields: { ttlDescription },
    submitLabel: "Submit"
  },
  edit: {
    schema: namespaceEditFormSchema,
    getDefaultValues: getNamespaceEditDefaultValues,
    toPayload: getNamespaceEditPayload,
    commonFields: { ttlDescription },
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

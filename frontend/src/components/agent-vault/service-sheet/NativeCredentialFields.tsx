import { useId } from "react";
import { Controller, ControllerRenderProps, useFormContext } from "react-hook-form";
import { format } from "date-fns";

import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { SecretInput as SecretTextArea } from "@app/components/v3/platform/SecretInput/SecretInput";
import {
  AgentVaultCredentialType,
  TAgentVaultMemberProvidedField,
  TAgentVaultNativeServiceType
} from "@app/hooks/api/agentVault";

import { CredentialFields, SecretInput } from "./CredentialFields";
import { DynamicSecretCredentialFields } from "./DynamicSecretCredentialFields";
import {
  clientCertificateExpiry,
  NATIVE_CREDENTIAL_TYPES,
  nativeCredentialLabels,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";

// A stored key is never returned, so the box stays empty while it is kept and the sentinel never shows as text.
const KeyTextArea = ({
  field,
  id,
  label,
  placeholder,
  storedPlaceholder,
  hasStoredValue,
  isError
}: {
  field: ControllerRenderProps<
    TServiceForm,
    "sshPrivateKey" | "sshCertificate" | "clientCertificate" | "clientPrivateKey"
  >;
  id: string;
  label: string;
  placeholder: string;
  storedPlaceholder: string;
  hasStoredValue: boolean;
  isError: boolean;
}) => {
  const isUntouched = field.value === UNCHANGED_SECRET;
  return (
    <SecretTextArea
      id={id}
      aria-label={label}
      ref={field.ref}
      isMultiline
      maskEachCharacter
      value={isUntouched ? "" : field.value}
      placeholder={isUntouched ? storedPlaceholder : placeholder}
      onChange={(event) => field.onChange(event.target.value)}
      onBlur={() => {
        if (hasStoredValue && !field.value) field.onChange(UNCHANGED_SECRET);
        field.onBlur();
      }}
      isError={isError}
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      data-bwignore
    />
  );
};

type Props = {
  serviceType: TAgentVaultNativeServiceType;
  storedType?: AgentVaultCredentialType;
  storedMemberFields?: TAgentVaultMemberProvidedField[];
  /** Whether the stored SSH key credential has a certificate. */
  hasStoredCertificate?: boolean;
  /** When the stored client certificate expires, as an ISO date. */
  storedCertificateExpiry?: string;
  /** Whether the stored dynamic secret has been deleted. */
  isStoredDynamicSecretMissing?: boolean;
};

export const NativeCredentialFields = ({
  serviceType,
  storedType,
  storedMemberFields,
  hasStoredCertificate = false,
  storedCertificateExpiry,
  isStoredDynamicSecretMissing = false
}: Props) => {
  const { control, watch, setValue } = useFormContext<TServiceForm>();
  const baseId = useId();
  const credentialType = watch("credentialType");
  const username = watch("username");
  const sshCertificateRemoved = watch("sshCertificateRemoved");
  const clientCertificate = watch("clientCertificate");

  const isSshKey = credentialType === AgentVaultCredentialType.SshKey;
  const hasStoredKey = storedType === AgentVaultCredentialType.SshKey && isSshKey;
  const hasCertificateToKeep = hasStoredKey && hasStoredCertificate;
  const isCertificateRemoved = hasCertificateToKeep && sshCertificateRemoved;

  const isClientCertificate = credentialType === AgentVaultCredentialType.ClientCertificate;
  const hasStoredClientCertificate =
    storedType === AgentVaultCredentialType.ClientCertificate && isClientCertificate;
  const expiry = isClientCertificate
    ? clientCertificateExpiry(clientCertificate, storedCertificateExpiry)
    : null;
  const isExpired = expiry !== null && expiry.getTime() <= Date.now();
  const isStoredExpiry = clientCertificate === UNCHANGED_SECRET || !clientCertificate.trim();

  const setCertificateRemoved = (isRemoved: boolean) => {
    setValue("sshCertificateRemoved", isRemoved, { shouldDirty: true });
    setValue("sshCertificate", UNCHANGED_SECRET, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="flex flex-col gap-5">
      <CredentialFields
        storedType={storedType}
        storedMemberFields={storedMemberFields}
        credentialTypes={NATIVE_CREDENTIAL_TYPES[serviceType]}
        typeLabels={nativeCredentialLabels(serviceType)}
        showsSendsPreview={false}
        stacksLogin
      />

      {isSshKey && (
        <>
          <Controller
            control={control}
            name="username"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Username</FieldLabel>
                <FieldContent>
                  <SecretInput
                    field={field}
                    label="Username"
                    placeholder="The user to log in as"
                    isError={Boolean(fieldState.error)}
                    isUntouched={username === UNCHANGED_SECRET}
                    hasStoredSecret={hasStoredKey}
                    canBeCleared={false}
                    allowsVariables={false}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="sshPrivateKey"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={`${baseId}-private-key`}>Private Key</FieldLabel>
                <FieldContent>
                  <KeyTextArea
                    field={field}
                    id={`${baseId}-private-key`}
                    label="Private key"
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    storedPlaceholder="Stored. Paste a new key to replace it."
                    hasStoredValue={hasStoredKey}
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="sshCertificate"
            render={({ field, fieldState }) => (
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`${baseId}-certificate`}>Certificate (optional)</FieldLabel>
                  {hasCertificateToKeep && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setCertificateRemoved(!isCertificateRemoved)}
                    >
                      {isCertificateRemoved ? "Keep Certificate" : "Remove Certificate"}
                    </Button>
                  )}
                </div>
                <FieldContent>
                  {isCertificateRemoved ? (
                    <FieldDescription>
                      The stored certificate is removed when you save.
                    </FieldDescription>
                  ) : (
                    <KeyTextArea
                      field={field}
                      id={`${baseId}-certificate`}
                      label="Certificate"
                      placeholder="ssh-ed25519-cert-v01@openssh.com AAAA..."
                      storedPlaceholder="Stored. Paste a new certificate to replace it."
                      hasStoredValue={hasCertificateToKeep}
                      isError={Boolean(fieldState.error)}
                    />
                  )}
                  {!isCertificateRemoved && (
                    <FieldDescription>
                      For a server that trusts SSH certificates signed by your authority.
                    </FieldDescription>
                  )}
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </>
      )}

      {isClientCertificate && (
        <>
          <Controller
            control={control}
            name="clientCertificate"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={`${baseId}-client-certificate`}>
                  Client Certificate (PEM)
                </FieldLabel>
                <FieldContent>
                  <KeyTextArea
                    field={field}
                    id={`${baseId}-client-certificate`}
                    label="Client certificate"
                    placeholder="-----BEGIN CERTIFICATE-----"
                    storedPlaceholder="Stored. Paste a new certificate and key to replace them."
                    hasStoredValue={hasStoredClientCertificate}
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription>
                    The client&apos;s certificate first, followed by any intermediate certificates.
                  </FieldDescription>
                  {expiry && isExpired && (
                    <FieldError>
                      {`${isStoredExpiry ? "The stored certificate" : "This certificate"} expired on ${format(expiry, "MMM d, yyyy")}.`}
                      {isStoredExpiry && " Paste a new certificate and key to replace it."}
                    </FieldError>
                  )}
                  {expiry && !isExpired && (
                    <FieldDescription>
                      {`${isStoredExpiry ? "The stored certificate" : "This certificate"} expires on ${format(expiry, "MMM d, yyyy")}.`}
                    </FieldDescription>
                  )}
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="clientPrivateKey"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor={`${baseId}-client-private-key`}>Private Key (PEM)</FieldLabel>
                <FieldContent>
                  <KeyTextArea
                    field={field}
                    id={`${baseId}-client-private-key`}
                    label="Private key"
                    placeholder="-----BEGIN PRIVATE KEY-----"
                    storedPlaceholder="Stored. Paste a new key with a new certificate to replace it."
                    hasStoredValue={hasStoredClientCertificate}
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription>
                    The key of the client certificate, without a passphrase.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
        </>
      )}

      {credentialType === AgentVaultCredentialType.DynamicSecret && (
        <DynamicSecretCredentialFields
          isStoredDynamicSecretMissing={isStoredDynamicSecretMissing}
        />
      )}
    </div>
  );
};

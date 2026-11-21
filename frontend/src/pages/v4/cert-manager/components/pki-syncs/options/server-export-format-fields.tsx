import { Controller } from "react-hook-form";
import { Alert } from "@infisical/cipher/ui/alert";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Select } from "@infisical/cipher/ui/select";

import {
  isKeystoreExportFormat,
  PemCertificateExtension,
  PKI_SYNC_EXPORT_FORMAT_LABELS,
  type PkiSync,
  PkiSyncExportFormat
} from "@app/hooks/api/pkiSyncs/enums";

import { errorOf, TextField, usePkiSyncForm, useWatchedValue } from "../fields";
import { usePkiSyncOption } from "../shared";
import { SyncSwitchField } from "./sync-switch-field";

const PEM_EXTENSION_OPTIONS = [
  { value: PemCertificateExtension.Pem, label: ".pem" },
  { value: PemCertificateExtension.Crt, label: ".crt" }
];

export function ServerExportFormatFields({ isUpdate }: { isUpdate?: boolean }) {
  const { control } = usePkiSyncForm();
  const destination = useWatchedValue<PkiSync>("destination");
  const exportFormat = useWatchedValue<PkiSyncExportFormat | undefined>("syncOptions.exportFormat");
  const { syncOption } = usePkiSyncOption(destination);
  const isKeystore = isKeystoreExportFormat(exportFormat);
  const isJksBlockedByFips = Boolean(
    syncOption?.unsupportedExportFormats?.includes(PkiSyncExportFormat.Jks)
  );
  const keystoreLabel = exportFormat === PkiSyncExportFormat.Jks ? "JKS" : "PKCS#12";
  const keystoreFile = exportFormat === PkiSyncExportFormat.Jks ? ".jks keystore" : ".pfx bundle";

  return (
    <>
      <Controller
        control={control}
        name="syncOptions.exportFormat"
        render={({ field, fieldState: { error } }) => (
          <Field
            label="Export format"
            help="PEM writes separate certificate, chain, and key files. PKCS#12 writes a single password-protected .pfx bundle. Java KeyStore writes a password-protected .jks keystore for Java servers such as Tomcat and WebLogic."
            error={errorOf(error)}
          >
            <Select
              value={(field.value as PkiSyncExportFormat | undefined) ?? PkiSyncExportFormat.Pem}
              onValueChange={(value) => field.onChange(value as PkiSyncExportFormat)}
              options={Object.values(PkiSyncExportFormat).map((format) => {
                const disabled = format === PkiSyncExportFormat.Jks && isJksBlockedByFips;
                return {
                  value: format,
                  label: PKI_SYNC_EXPORT_FORMAT_LABELS[format],
                  disabled,
                  description: disabled ? "Not available in FIPS mode" : undefined
                };
              })}
              invalid={Boolean(error)}
            />
          </Field>
        )}
      />
      {exportFormat === PkiSyncExportFormat.Jks && isJksBlockedByFips && (
        <Alert tone="warn" title="JKS isn't available in FIPS mode">
          The format can only protect private keys with cryptography that is not FIPS-approved, so
          this sync will not deliver certificates. Switch the export format to PEM.
        </Alert>
      )}
      {exportFormat === PkiSyncExportFormat.Pem && (
        <>
          <Controller
            control={control}
            name="syncOptions.pemCertificateExtension"
            render={({ field, fieldState: { error } }) => (
              <Field
                label="Certificate file extension"
                help="The extension for the certificate and chain files. Both hold the same PEM-encoded content; choose the one the consuming service expects."
                error={errorOf(error)}
              >
                <Select
                  value={
                    (field.value as PemCertificateExtension | undefined) ??
                    PemCertificateExtension.Pem
                  }
                  onValueChange={(value) => field.onChange(value as PemCertificateExtension)}
                  options={PEM_EXTENSION_OPTIONS}
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
          <SyncSwitchField
            name="syncOptions.combineCertificateChain"
            label="Combine certificate and chain"
            description="When enabled, the certificate file holds the leaf certificate followed by the chain (a full-chain file, as nginx expects) and no separate chain file is written."
          />
        </>
      )}
      {isKeystore && (
        <>
          <Controller
            control={control}
            name="credentials.exportPassword"
            render={({ field, fieldState: { error } }) => (
              <Field
                label={`${keystoreLabel} password`}
                help={
                  isUpdate
                    ? `Protects the ${keystoreFile}. Leave blank to keep the current password.`
                    : `Protects the ${keystoreFile}.`
                }
                error={errorOf(error)}
              >
                <Input
                  ref={field.ref}
                  name={field.name}
                  type="password"
                  value={(field.value as string | undefined) ?? ""}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder="Enter a password"
                  autoComplete="new-password"
                  invalid={Boolean(error)}
                />
              </Field>
            )}
          />
          <TextField
            name="syncOptions.keystoreAlias"
            label="Keystore alias"
            help="The alias of the private key entry, for example the value of Tomcat's certificateKeyAlias. Defaults to the certificate's file name. Each renewal replaces the entry under this alias."
            placeholder="Defaults to the certificate file name"
          />
        </>
      )}
      {exportFormat === PkiSyncExportFormat.Jks && (
        <SyncSwitchField
          name="syncOptions.includeTruststore"
          label="Include truststore"
          description="When enabled, a separate .truststore.jks file holding the certificate's CA chain and root CA as trusted entries is written next to the keystore. It uses the same password."
        />
      )}
      {!isKeystore && (
        <SyncSwitchField
          name="syncOptions.includePrivateKey"
          label="Include private key"
          description="When enabled, the certificate's private key is written alongside the certificate as a .key file. The sync fails for a certificate whose key is not available (for example, one issued from an external CSR)."
          defaultChecked
        />
      )}
    </>
  );
}

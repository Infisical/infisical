import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  isKeystoreExportFormat,
  PemCertificateExtension,
  PKI_SYNC_EXPORT_FORMAT_LABELS,
  PkiSyncExportFormat
} from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";

type Props = {
  isUpdate?: boolean;
};

export const ServerExportFormatFields = ({ isUpdate }: Props) => {
  const { control, watch, setValue, getValues } = useFormContext<TPkiSyncForm>();
  const exportFormat = watch("syncOptions.exportFormat");
  const isKeystore = isKeystoreExportFormat(exportFormat);

  useEffect(() => {
    if (!isKeystore && getValues("syncOptions.keystoreAlias")) {
      setValue("syncOptions.keystoreAlias", undefined, { shouldDirty: true });
    }
    if (exportFormat !== PkiSyncExportFormat.Jks && getValues("syncOptions.includeTruststore")) {
      setValue("syncOptions.includeTruststore", undefined, { shouldDirty: true });
    }
  }, [exportFormat, isKeystore]);
  const keystoreLabel = exportFormat === PkiSyncExportFormat.Jks ? "JKS" : "PKCS#12";
  const keystoreFile = exportFormat === PkiSyncExportFormat.Jks ? ".jks keystore" : ".pfx bundle";

  return (
    <>
      <Controller
        control={control}
        name="syncOptions.exportFormat"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Export format
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  PEM writes separate certificate, chain, and key files. PKCS#12 writes a single
                  password-protected .pfx bundle. Java KeyStore writes a password-protected .jks
                  keystore for Java servers such as Tomcat and WebLogic.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Select
              value={value ?? PkiSyncExportFormat.Pem}
              onValueChange={(v) => onChange(v as PkiSyncExportFormat)}
            >
              <SelectTrigger className="w-full" isError={Boolean(error)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.values(PkiSyncExportFormat).map((format) => (
                  <SelectItem key={format} value={format}>
                    {PKI_SYNC_EXPORT_FORMAT_LABELS[format]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      {exportFormat === PkiSyncExportFormat.Pem && (
        <Controller
          control={control}
          name="syncOptions.pemCertificateExtension"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Certificate file extension
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The extension for the certificate and chain files. Both hold the same
                    PEM-encoded content; choose the one the consuming service expects.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                value={value ?? PemCertificateExtension.Pem}
                onValueChange={(v) => onChange(v as PemCertificateExtension)}
              >
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={PemCertificateExtension.Pem}>.pem</SelectItem>
                  <SelectItem value={PemCertificateExtension.Crt}>.crt</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
      {exportFormat === PkiSyncExportFormat.Pem && (
        <Controller
          control={control}
          name="syncOptions.combineCertificateChain"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="combine-certificate-chain">Combine certificate and chain</Label>
                  <FieldDescription>
                    When enabled, the certificate file holds the leaf certificate followed by the
                    chain (a full-chain file, as nginx expects) and no separate chain file is
                    written.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  id="combine-certificate-chain"
                  variant="project"
                  checked={value ?? false}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
      {isKeystore && (
        <Controller
          control={control}
          name="credentials.exportPassword"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                {keystoreLabel} password
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {isUpdate
                      ? `Protects the ${keystoreFile}. Leave blank to keep the current password.`
                      : `Protects the ${keystoreFile}.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                type="password"
                value={value ?? ""}
                onChange={onChange}
                placeholder="Enter a password"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
      {isKeystore && (
        <Controller
          control={control}
          name="syncOptions.keystoreAlias"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Keystore alias
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The alias of the private key entry, for example the value of Tomcat&apos;s
                    certificateKeyAlias. Defaults to the certificate&apos;s file name. Each renewal
                    replaces the entry under this alias.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                value={value ?? ""}
                onChange={onChange}
                placeholder="Defaults to the certificate file name"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
      {exportFormat === PkiSyncExportFormat.Jks && (
        <Controller
          control={control}
          name="syncOptions.includeTruststore"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="include-truststore">Deliver truststore</Label>
                  <FieldDescription>
                    When enabled, a separate .truststore.jks file holding the certificate&apos;s CA
                    chain and root CA as trusted entries is written next to the keystore. It uses
                    the same password.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  id="include-truststore"
                  variant="project"
                  checked={value ?? false}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
      {!isKeystore && (
        <Controller
          control={control}
          name="syncOptions.includePrivateKey"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="include-private-key">Include private key</Label>
                  <FieldDescription>
                    When enabled, the certificate&apos;s private key is written alongside the
                    certificate as a .key file. The sync fails for a certificate whose key is not
                    available (for example, one issued from an external CSR).
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  id="include-private-key"
                  variant="project"
                  checked={value ?? true}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
    </>
  );
};

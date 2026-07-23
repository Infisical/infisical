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
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PemCertificateExtension, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";

type Props = {
  isUpdate?: boolean;
};

export const ServerExportFormatFields = ({ isUpdate }: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();

  return (
    <>
      <Controller
        control={control}
        name="syncOptions.exportFormat"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Export Format
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  PEM writes separate certificate, chain, and key files. PKCS#12 writes a single
                  password-protected .pfx bundle.
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
                <SelectItem value={PkiSyncExportFormat.Pem}>PEM</SelectItem>
                <SelectItem value={PkiSyncExportFormat.Pkcs12}>PKCS#12 (.pfx)</SelectItem>
              </SelectContent>
            </Select>
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      {watch("syncOptions.exportFormat") === PkiSyncExportFormat.Pem && (
        <Controller
          control={control}
          name="syncOptions.pemCertificateExtension"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Certificate File Extension
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
      {watch("syncOptions.exportFormat") === PkiSyncExportFormat.Pem && (
        <Controller
          control={control}
          name="syncOptions.combineCertificateChain"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="combine-certificate-chain">Combine Certificate and Chain</Label>
                  <FieldDescription>
                    When enabled, the certificate file holds the leaf certificate followed by the
                    chain (a full-chain file, as nginx expects) and no separate chain file is
                    written.
                  </FieldDescription>
                </FieldContent>
                <Switch
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
      {watch("syncOptions.exportFormat") === PkiSyncExportFormat.Pkcs12 && (
        <Controller
          control={control}
          name="credentials.exportPassword"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                PKCS#12 Password
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {isUpdate
                      ? "Protects the .pfx bundle. Leave blank to keep the current password."
                      : "Protects the .pfx bundle."}
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
      {watch("syncOptions.exportFormat") !== PkiSyncExportFormat.Pkcs12 && (
        <Controller
          control={control}
          name="syncOptions.includePrivateKey"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="include-private-key">Include Private Key</Label>
                  <FieldDescription>
                    When enabled, the certificate&apos;s private key is written alongside the
                    certificate as a .key file. The sync fails for a certificate whose key is not
                    available (for example, one issued from an external CSR).
                  </FieldDescription>
                </FieldContent>
                <Switch
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

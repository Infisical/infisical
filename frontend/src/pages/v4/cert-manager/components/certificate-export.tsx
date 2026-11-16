import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, readableFailure, saved } from "../../access/toast";
import { PasswordField } from "../../auth/components/PasswordField";
import { useV4Adapter } from "../../data/adapters";
import {
  type CertificatesAdapter,
  certificateFileName,
  type TCertificateExportFormat
} from "../../data/certificates/contract";
import { certificateName } from "./certificate";
import { exportFormatLabel } from "./certificate-export-format";

const NO_PRIVATE_KEY = "No private key is stored for this certificate";
const NO_KEY_ACCESS = "You need permission to read this certificate's private key";

export const usePkcs12Block = (cert: TCertificate, projectId: string) => {
  const { permission } = useProjectPermission(projectId);
  const { data: appAccess } = useV4Adapter("pkiApplications").useApplicationPermissions(
    cert.applicationId ?? ""
  );
  if (cert.hasPrivateKey === false) return NO_PRIVATE_KEY;
  const canRead =
    permission.can(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    ) ||
    Boolean(
      appAccess?.permission?.can(
        PkiApplicationResourceActions.ReadPrivateKey,
        PkiApplicationResourceSub.Certificates
      )
    );
  return canRead ? undefined : NO_KEY_ACCESS;
};

const download = async (
  exporter: ReturnType<CertificatesAdapter["useExportCertificate"]>,
  cert: TCertificate,
  format: TCertificateExportFormat,
  pkcs12?: { password: string; alias: string }
) =>
  exporter.mutateAsync({
    certificateId: cert.id,
    serialNumber: cert.serialNumber,
    fileName: certificateFileName(certificateName(cert)),
    format,
    pkcs12
  });

export const useExportCertificate = () => {
  const exporter = useV4Adapter("certificates").useExportCertificate();
  return {
    isPending: exporter.isPending,
    download: async (cert: TCertificate, format: Exclude<TCertificateExportFormat, "pkcs12">) => {
      try {
        await download(exporter, cert, format);
        saved(`${exportFormatLabel[format]} downloaded`);
      } catch (error) {
        failed(`Couldn't download the ${exportFormatLabel[format]}`, error);
      }
    }
  };
};

type ExportErrors = { password?: string; alias?: string };

const ExportCertificateForm = ({
  cert,
  projectId,
  initialFormat,
  onClose
}: {
  cert: TCertificate;
  projectId: string;
  initialFormat: TCertificateExportFormat;
  onClose: () => void;
}) => {
  const { data: config } = useV4Adapter("admin").useServerConfig();
  const policy = config?.pkcs12PasswordPolicy;
  const exporter = useV4Adapter("certificates").useExportCertificate();
  const name = certificateName(cert);
  const [format, setFormat] = useState(initialFormat);
  const [password, setPassword] = useState("");
  const [alias, setAlias] = useState(name.slice(0, 255));
  const [errors, setErrors] = useState<ExportErrors>({});
  const [attempts, setAttempts] = useState(0);
  const noKey = usePkcs12Block(cert, projectId);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: password !== "" || alias !== name.slice(0, 255),
    onDiscard: onClose
  });

  const passwordRegistration: UseFormRegisterReturn = {
    name: "password",
    ref: () => {},
    onBlur: async () => {},
    onChange: async (event) => {
      setPassword(event.target.value);
      setErrors((current) => ({ ...current, password: undefined }));
    }
  };

  const validate = () => {
    if (format !== "pkcs12") return true;
    setAttempts((count) => count + 1);
    const next: ExportErrors = {};
    const checked = (policy ? createPasswordSchema(policy) : z.string().min(1)).safeParse(password);
    if (!checked.success)
      next.password = checked.error.issues[0]?.message ?? "Enter a keystore password";
    const trimmed = alias.trim();
    if (!trimmed) next.alias = "Enter an alias";
    else if (trimmed.length > 255) next.alias = "Use 255 characters or fewer";
    setErrors(next);
    return !next.password && !next.alias;
  };

  const submit = async () => {
    await download(
      exporter,
      cert,
      format,
      format === "pkcs12" ? { password, alias: alias.trim() } : undefined
    ).catch(readableFailure(`Couldn't download the ${exportFormatLabel[format]}`));
    saved(`${exportFormatLabel[format]} downloaded`);
    onClose();
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        title={`Export ${name}`}
        open
        onOpenChange={(next) => {
          if (next || exporter.isPending) return;
          requestDiscard();
        }}
        completeLabel="Download"
        onComplete={submit}
        steps={[
          {
            title: "Export",
            completeIcon: "download",
            disabledReason: format === "pkcs12" ? noKey : undefined,
            validate,
            content: (
              <Stack gap={16}>
                <Field label="Format">
                  <Select
                    label="Format"
                    value={format}
                    onChange={(next) => setFormat(next as TCertificateExportFormat)}
                    options={[
                      { value: "pem", label: exportFormatLabel.pem },
                      { value: "chain", label: exportFormatLabel.chain },
                      {
                        value: "pkcs12",
                        label: exportFormatLabel.pkcs12,
                        description: noKey ?? "Includes the private key",
                        disabled: Boolean(noKey)
                      }
                    ]}
                  />
                </Field>
                {format === "pkcs12" && (
                  <>
                    <PasswordField
                      label="Keystore password"
                      value={password}
                      policy={policy ?? { requirements: [] }}
                      breachStatus="idle"
                      registration={passwordRegistration}
                      error={errors.password}
                      submitCount={attempts}
                    />
                    <Field label="Alias" error={errors.alias}>
                      <Input
                        value={alias}
                        autoComplete="off"
                        invalid={Boolean(errors.alias)}
                        onChange={(event) => {
                          setAlias(event.target.value);
                          setErrors((current) => ({ ...current, alias: undefined }));
                        }}
                      />
                    </Field>
                  </>
                )}
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="The keystore password and alias will be lost."
      />
    </>
  );
};

export const ExportCertificateDialog = ({
  cert,
  projectId,
  initialFormat = "pem",
  onClose
}: {
  cert?: TCertificate;
  projectId: string;
  initialFormat?: TCertificateExportFormat;
  onClose: () => void;
}) =>
  cert ? (
    <ExportCertificateForm
      cert={cert}
      projectId={projectId}
      initialFormat={initialFormat}
      onClose={onClose}
    />
  ) : null;

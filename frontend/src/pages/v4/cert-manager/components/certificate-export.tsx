import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import type { TPasswordPolicy } from "@app/hooks/api/admin/types";
import type { TCertificate } from "@app/hooks/api/certificates/types";

import { failed, saved } from "../../access/toast";
import { PasswordField } from "../../auth/components/PasswordField";
import { useV4Adapter } from "../../data/adapters";
import {
  certificateFileName,
  type TCertificateExportFormat
} from "../../data/certificates/contract";
import { certificateName } from "./certificate";
import { exportFormatLabel, pkcs12Block } from "./certificate-export-format";

export const useExportCertificate = () => {
  const exporter = useV4Adapter("certificates").useExportCertificate();
  return {
    isPending: exporter.isPending,
    download: async (
      cert: TCertificate,
      format: TCertificateExportFormat,
      pkcs12?: { password: string; alias: string }
    ) => {
      try {
        await exporter.mutateAsync({
          certificateId: cert.id,
          serialNumber: cert.serialNumber,
          fileName: certificateFileName(certificateName(cert)),
          format,
          pkcs12
        });
        saved(`${exportFormatLabel[format]} downloaded`);
        return true;
      } catch (error) {
        failed(`Couldn't download the ${exportFormatLabel[format]}`, error);
        return false;
      }
    }
  };
};

const exportSchema = (policy?: TPasswordPolicy) =>
  z
    .object({
      format: z.enum(["pem", "chain", "pkcs12"]),
      password: z.string(),
      alias: z.string()
    })
    .superRefine((data, context) => {
      if (data.format !== "pkcs12") return;
      const password = (policy ? createPasswordSchema(policy) : z.string().min(1)).safeParse(
        data.password
      );
      if (!password.success)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: password.error.issues[0]?.message ?? "Enter a keystore password",
          path: ["password"]
        });
      const alias = data.alias.trim();
      if (!alias)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter an alias",
          path: ["alias"]
        });
      else if (alias.length > 255)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Use 255 characters or fewer",
          path: ["alias"]
        });
    });

type ExportForm = z.infer<ReturnType<typeof exportSchema>>;

const ExportCertificateForm = ({
  cert,
  initialFormat,
  onClose
}: {
  cert: TCertificate;
  initialFormat: TCertificateExportFormat;
  onClose: () => void;
}) => {
  const { data: config } = useV4Adapter("admin").useServerConfig();
  const policy = config?.pkcs12PasswordPolicy;
  const exporter = useExportCertificate();
  const name = certificateName(cert);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, submitCount }
  } = useForm<ExportForm>({
    resolver: zodResolver(exportSchema(policy)),
    defaultValues: { format: initialFormat, password: "", alias: name.slice(0, 255) }
  });
  const format = watch("format");
  const password = watch("password");
  const noKey = pkcs12Block(cert);

  const submit = async (data: ExportForm) => {
    const done = await exporter.download(
      cert,
      data.format,
      data.format === "pkcs12" ? { password: data.password, alias: data.alias.trim() } : undefined
    );
    if (done) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={exporter.isPending}>
        <DialogHeader>
          <DialogTitle>{`Export ${name}`}</DialogTitle>
        </DialogHeader>
        <form id="export-certificate" onSubmit={handleSubmit(submit)}>
          <Stack gap={16}>
            <Field label="Format">
              <Select
                label="Format"
                value={format}
                onChange={(next) => setValue("format", next as TCertificateExportFormat)}
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
                  registration={register("password")}
                  error={errors.password?.message}
                  submitCount={submitCount}
                />
                <Field label="Alias" error={errors.alias?.message}>
                  <Input
                    {...register("alias")}
                    autoComplete="off"
                    invalid={Boolean(errors.alias)}
                  />
                </Field>
              </>
            )}
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="download"
            type="submit"
            form="export-certificate"
            loading={exporter.isPending}
          >
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ExportCertificateDialog = ({
  cert,
  initialFormat = "pem",
  onClose
}: {
  cert?: TCertificate;
  initialFormat?: TCertificateExportFormat;
  onClose: () => void;
}) =>
  cert ? (
    <ExportCertificateForm cert={cert} initialFormat={initialFormat} onClose={onClose} />
  ) : null;

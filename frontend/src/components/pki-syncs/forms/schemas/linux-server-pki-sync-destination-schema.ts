import { z } from "zod";

import { PemCertificateExtension, PkiSync, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const compileNameSchema = (val: string) =>
  val
    .replace(/\{\{shortCertificateId\}\}/g, "0".repeat(22))
    .replace(/\{\{certificateId\}\}/g, "0".repeat(32))
    .replace(/\{\{profileId\}\}/g, "0".repeat(32))
    .replace(/\{\{applicationId\}\}/g, "0".repeat(32))
    .replace(/\{\{applicationName\}\}/g, "application-name")
    .replace(/\{\{commonName\}\}/g, "common-name");

const LinuxServerSyncOptionsSchema = z.object({
  exportFormat: z.nativeEnum(PkiSyncExportFormat).default(PkiSyncExportFormat.Pem),
  pemCertificateExtension: z
    .nativeEnum(PemCertificateExtension)
    .default(PemCertificateExtension.Pem),
  combineCertificateChain: z.boolean().default(false),
  includePrivateKey: z.boolean().default(true),
  fileMode: z
    .string()
    .trim()
    .refine((m) => !m || /^0?[0-7]{3}$/.test(m), {
      message: "File mode must be a 3-digit octal value (e.g. 644)"
    })
    .transform((v) => v || undefined)
    .optional(),
  privateKeyFileMode: z
    .string()
    .trim()
    .refine((m) => !m || /^0?[0-7]{3}$/.test(m), {
      message: "Private key file mode must be a 3-digit octal value (e.g. 600)"
    })
    .transform((v) => v || undefined)
    .optional(),
  owner: z
    .string()
    .trim()
    .max(32)
    .refine((v) => !v || /^[a-z_][a-z0-9_-]*\$?$/i.test(v), {
      message: "Owner must be a valid Linux user name"
    })
    .transform((v) => v || undefined)
    .optional(),
  group: z
    .string()
    .trim()
    .max(32)
    .refine((v) => !v || /^[a-z_][a-z0-9_-]*\$?$/i.test(v), {
      message: "Group must be a valid Linux group name"
    })
    .transform((v) => v || undefined)
    .optional(),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (val) => {
        const compiled = compileNameSchema(val);
        return /^[a-zA-Z0-9._-]{1,200}$/.test(compiled);
      },
      {
        message:
          "Certificate name schema must resolve to a single file name of 1-200 characters using only letters, digits, dots (.), dashes (-), and underscores (_). Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}. A schema with no placeholder can be linked to only one certificate."
      }
    )
});

const DestinationPathSchema = z
  .string()
  .trim()
  .min(1, "Destination path is required")
  .max(4096, "Destination path is too long")
  .refine((p) => p.startsWith("/"), { message: "Destination path must be absolute (start with /)" })
  .refine((p) => !/(^|\/)\.\.(\/|$)/.test(p), {
    message: "Destination path must not contain '..'"
  });

export const LinuxServerPkiSyncDestinationSchema = BasePkiSyncSchema(
  LinuxServerSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.LinuxServer),
    destinationConfig: z.object({
      destinationPath: DestinationPathSchema
    }),
    credentials: z
      .object({
        exportPassword: z.string().min(1).optional()
      })
      .optional()
  })
);

export const UpdateLinuxServerPkiSyncDestinationSchema =
  LinuxServerPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.LinuxServer),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );

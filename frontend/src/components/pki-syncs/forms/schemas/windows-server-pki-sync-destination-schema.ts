import { z } from "zod";

import { PkiSync, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const compileNameSchema = (val: string) =>
  val
    .replace(/\{\{shortCertificateId\}\}/g, "0".repeat(22))
    .replace(/\{\{certificateId\}\}/g, "0".repeat(32))
    .replace(/\{\{profileId\}\}/g, "0".repeat(32))
    .replace(/\{\{applicationId\}\}/g, "0".repeat(32))
    .replace(/\{\{applicationName\}\}/g, "application-name")
    .replace(/\{\{commonName\}\}/g, "common-name");

const WindowsServerSyncOptionsSchema = z.object({
  exportFormat: z.nativeEnum(PkiSyncExportFormat).default(PkiSyncExportFormat.Pkcs12),
  includePrivateKey: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine((val) => /^[a-zA-Z0-9._-]{1,200}$/.test(compileNameSchema(val)), {
      message:
        "Certificate name schema must resolve to a single file name of 1-200 characters using only letters, digits, dots (.), dashes (-), and underscores (_). Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}. A schema with no placeholder can be linked to only one certificate."
    })
});

const WindowsDestinationPathSchema = z
  .string()
  .trim()
  .min(1, "Destination path is required")
  .max(4096, "Destination path is too long")
  .refine((p) => /^[a-zA-Z]:\\/.test(p), {
    message: "Destination path must be an absolute Windows drive path (for example C:\\certs)"
  })
  .refine((p) => !/(^|[\\/])\.\.([\\/]|$)/.test(p), {
    message: "Destination path must not contain '..'"
  })
  .refine((p) => !/[\\/]{2,}/.test(p), {
    message: "Destination path must not contain consecutive path separators"
  });

export const WindowsServerPkiSyncDestinationSchema = BasePkiSyncSchema(
  WindowsServerSyncOptionsSchema
).merge(
  z.object({
    destination: z.literal(PkiSync.WindowsServer),
    destinationConfig: z.object({
      destinationPath: WindowsDestinationPathSchema
    }),
    credentials: z
      .object({
        exportPassword: z.string().min(1).optional()
      })
      .optional()
  })
);

export const UpdateWindowsServerPkiSyncDestinationSchema =
  WindowsServerPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.WindowsServer),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );

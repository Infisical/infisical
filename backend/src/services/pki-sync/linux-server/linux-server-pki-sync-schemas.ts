import RE2 from "re2";
import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { buildCertificateNameSchemaTestName } from "@app/services/pki-sync/pki-sync-certificate-name-fns";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PemCertificateExtension, PkiSyncExportFormat } from "@app/services/pki-sync/pki-sync-export-fns";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { LINUX_SERVER_NAMING } from "./linux-server-pki-sync-constants";

const PATH_TRAVERSAL = new RE2("(^|/)\\.\\.(/|$)");
// A 3- or 4-digit octal file mode, optionally with a leading zero (e.g. "640", "0640").
const OCTAL_FILE_MODE = new RE2("^0?[0-7]{3}$");
// A POSIX user/group name. Restricted so it is safe to embed in the chown command run on the server.
const POSIX_NAME = new RE2("^[a-z_][a-z0-9_-]*\\$?$", "i");

export const LinuxServerPkiSyncConfigSchema = z.object({
  destinationPath: z
    .string()
    .trim()
    .min(1, "Destination path is required")
    .max(4096, "Destination path is too long")
    .refine((p) => p.startsWith("/"), { message: "Destination path must be absolute (start with /)" })
    .refine((p) => !PATH_TRAVERSAL.test(p), { message: "Destination path must not contain '..'" })
});

export const LinuxServerPkiSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(false),
  includeRootCa: z.boolean().default(false),
  includePrivateKey: z.boolean().default(true),
  exportFormat: z.nativeEnum(PkiSyncExportFormat).default(PkiSyncExportFormat.Pem),
  pemCertificateExtension: z.nativeEnum(PemCertificateExtension).default(PemCertificateExtension.Pem),
  combineCertificateChain: z.boolean().default(false),
  fileMode: z
    .string()
    .trim()
    .refine((m) => OCTAL_FILE_MODE.test(m), { message: "File mode must be a 3-digit octal value (for example 644)" })
    .optional(),
  privateKeyFileMode: z
    .string()
    .trim()
    .refine((m) => OCTAL_FILE_MODE.test(m), {
      message: "Private key file mode must be a 3-digit octal value (for example 600)"
    })
    .optional(),
  owner: z
    .string()
    .trim()
    .max(32)
    .refine((v) => POSIX_NAME.test(v), { message: "Owner must be a valid Linux user name" })
    .optional(),
  group: z
    .string()
    .trim()
    .max(32)
    .refine((v) => POSIX_NAME.test(v), { message: "Group must be a valid Linux group name" })
    .optional(),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (schema) => {
        const testName = buildCertificateNameSchemaTestName(schema);
        const hasForbiddenChars = LINUX_SERVER_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );
        return LINUX_SERVER_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "Certificate name schema must resolve to a single file name of 1-200 characters using only letters, digits, dots (.), dashes (-), and underscores (_). Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}. A schema with no placeholder can be linked to only one certificate."
      }
    )
});

// Sync-level secrets (the PKCS#12 export password) accepted on create/update. Stored encrypted in
// pki_syncs.encryptedCredentials and never returned.
export const LinuxServerPkiSyncCredentialsSchema = z.object({
  exportPassword: z.string().min(1).optional()
});

export const LinuxServerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.LinuxServer),
  destinationConfig: LinuxServerPkiSyncConfigSchema,
  syncOptions: LinuxServerPkiSyncOptionsSchema
});

export const CreateLinuxServerPkiSyncSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    description: z.string().optional(),
    isAutoSyncEnabled: z.boolean().default(true),
    destinationConfig: LinuxServerPkiSyncConfigSchema,
    syncOptions: LinuxServerPkiSyncOptionsSchema,
    credentials: LinuxServerPkiSyncCredentialsSchema.optional(),
    subscriberId: z.string().nullish(),
    connectionId: z.string(),
    applicationId: z.string().uuid().optional(),
    certificateIds: z.array(z.string().uuid()).optional()
  })
  .superRefine((data, ctx) => {
    if (data.syncOptions.exportFormat === PkiSyncExportFormat.Pkcs12 && !data.credentials?.exportPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["credentials", "exportPassword"],
        message: "A password is required when the export format is PKCS#12"
      });
    }
  });

export const UpdateLinuxServerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: LinuxServerPkiSyncConfigSchema.optional(),
  syncOptions: LinuxServerPkiSyncOptionsSchema.optional(),
  credentials: LinuxServerPkiSyncCredentialsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const LinuxServerPkiSyncListItemSchema = z.object({
  name: z.literal("Linux Server"),
  connection: z.literal(AppConnection.SSH),
  destination: z.literal(PkiSync.LinuxServer),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});

import RE2 from "re2";
import { z } from "zod";

import { openApiHidden } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { buildCertificateNameSchemaTestName } from "@app/services/pki-sync/pki-sync-certificate-name-fns";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncExportFormat } from "@app/services/pki-sync/pki-sync-export-fns";
import { PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";

import { WINDOWS_SERVER_NAMING } from "./windows-server-pki-sync-constants";

// Accepts a drive-letter path (C:\...) or a UNC path (\\server\share\...).
const WINDOWS_ABSOLUTE_PATH = new RE2("^([a-zA-Z]:\\\\|\\\\\\\\)");
// Rejects a ".." path segment. Windows treats both "\" and "/" as separators, so both must be
// checked or "C:\certs/../.." would slip past a backslash-only test.
const WINDOWS_PATH_TRAVERSAL = new RE2("(^|[\\\\/])\\.\\.([\\\\/]|$)");
// The path is embedded in a PowerShell single-quoted literal on the gateway. Restricting it to a
// conservative Windows-path character set keeps out shell metacharacters and the Unicode quote
// code points PowerShell also treats as string delimiters, so it cannot break out of the literal.
const WINDOWS_PATH_ALLOWED_CHARS = new RE2("^[A-Za-z0-9 ._\\-\\\\/:]+$");
// Runs of 2+ separators (e.g. C:\\certs). Windows can normalize these to a different location, so a
// delivery would silently land elsewhere; a single leading UNC prefix (\\server) is stripped first.
const WINDOWS_DOUBLE_SEPARATOR = new RE2("[\\\\/]{2,}");

export const WindowsServerPkiSyncConfigSchema = z.object({
  destinationPath: z
    .string()
    .trim()
    .min(1, "Destination path is required")
    .max(4096, "Destination path is too long")
    .refine((p) => WINDOWS_ABSOLUTE_PATH.test(p), {
      message: "Destination path must be an absolute Windows path (for example C:\\certs or \\\\server\\share)"
    })
    .refine((p) => WINDOWS_PATH_ALLOWED_CHARS.test(p), {
      message: "Destination path may only contain letters, digits, spaces, and the characters . _ - \\ / :"
    })
    .refine((p) => !WINDOWS_PATH_TRAVERSAL.test(p), { message: "Destination path must not contain '..'" })
    .refine((p) => !WINDOWS_DOUBLE_SEPARATOR.test(p.startsWith("\\\\") ? p.slice(2) : p), {
      message: "Destination path must not contain consecutive path separators"
    })
});

export const WindowsServerPkiSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(false),
  includeRootCa: z.boolean().default(false),
  includePrivateKey: z.boolean().default(true),
  exportFormat: z.nativeEnum(PkiSyncExportFormat).default(PkiSyncExportFormat.Pkcs12),
  certificateNameSchema: z
    .string()
    .trim()
    .min(1, "Certificate name schema is required")
    .refine(
      (schema) => {
        const testName = buildCertificateNameSchemaTestName(schema);
        const hasForbiddenChars = WINDOWS_SERVER_NAMING.FORBIDDEN_CHARACTERS.split("").some((char) =>
          testName.includes(char)
        );
        return WINDOWS_SERVER_NAMING.NAME_PATTERN.test(testName) && !hasForbiddenChars;
      },
      {
        message:
          "Certificate name schema must resolve to a single file name of 1-200 characters using only letters, digits, dots (.), dashes (-), and underscores (_). Available placeholders: {{certificateId}}, {{shortCertificateId}}, {{profileId}}, {{applicationId}}, {{applicationName}}, {{commonName}}. A schema with no placeholder can be linked to only one certificate."
      }
    )
});

// Sync-level secrets (the PKCS#12 export password) accepted on create/update. Stored encrypted in
// pki_syncs.encryptedCredentials and never returned.
export const WindowsServerPkiSyncCredentialsSchema = z.object({
  exportPassword: z.string().min(1).optional()
});

export const WindowsServerPkiSyncSchema = PkiSyncSchema.extend({
  destination: z.literal(PkiSync.WindowsServer),
  destinationConfig: WindowsServerPkiSyncConfigSchema,
  syncOptions: WindowsServerPkiSyncOptionsSchema
});

export const CreateWindowsServerPkiSyncSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    description: z.string().optional(),
    isAutoSyncEnabled: z.boolean().default(true),
    destinationConfig: WindowsServerPkiSyncConfigSchema,
    syncOptions: WindowsServerPkiSyncOptionsSchema,
    credentials: WindowsServerPkiSyncCredentialsSchema.optional(),
    subscriberId: z.string().nullish(),
    connectionId: z.string(),
    projectId: z.string().trim().min(1).optional().describe(openApiHidden()),
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

export const UpdateWindowsServerPkiSyncSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: WindowsServerPkiSyncConfigSchema.optional(),
  syncOptions: WindowsServerPkiSyncOptionsSchema.optional(),
  credentials: WindowsServerPkiSyncCredentialsSchema.optional(),
  subscriberId: z.string().nullish(),
  connectionId: z.string().optional()
});

export const WindowsServerPkiSyncListItemSchema = z.object({
  name: z.literal("Windows Server"),
  connection: z.literal(AppConnection.WinRM),
  destination: z.literal(PkiSync.WindowsServer),
  canImportCertificates: z.literal(false),
  canRemoveCertificates: z.literal(true)
});

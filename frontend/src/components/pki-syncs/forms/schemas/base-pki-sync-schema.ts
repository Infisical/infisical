import { AnyZodObject, z } from "zod";

export const BasePkiSyncSchema = <T extends AnyZodObject | undefined = undefined>(
  additionalSyncOptions?: T
) => {
  const baseSyncOptionsSchema = z.object({
    canImportCertificates: z.boolean().default(false),
    canRemoveCertificates: z.boolean().default(false),
    includeRootCa: z.boolean().default(false),
    certificateNameSchema: z
      .string()
      .trim()
      .min(1, "Certificate name schema is required")
      .refine(
        (val) => {
          const allowedOptionalPlaceholders = [
            "{{profileId}}",
            "{{applicationId}}",
            "{{applicationName}}",
            "{{commonName}}"
          ];

          const allowedPlaceholdersRegexPart = [
            "{{certificateId}}",
            "{{shortCertificateId}}",
            ...allowedOptionalPlaceholders
          ]
            .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")) // Escape regex special characters
            .join("|");

          const allowedContentRegex = new RegExp(
            `^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`
          );
          const contentIsValid = allowedContentRegex.test(val);

          const certificateIdIsPresent =
            val.includes("{{certificateId}}") || val.includes("{{shortCertificateId}}");
          return contentIsValid && certificateIdIsPresent;
        },
        {
          message:
            "Certificate name schema must include the {{certificateId}} or {{shortCertificateId}} placeholder. It can also include {{profileId}}, {{applicationId}}, {{applicationName}}, and {{commonName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders."
        }
      )
  });

  const syncOptionsSchema = additionalSyncOptions
    ? baseSyncOptionsSchema.merge(additionalSyncOptions)
    : (baseSyncOptionsSchema as T extends AnyZodObject
        ? z.ZodObject<z.objectUtil.MergeShapes<typeof baseSyncOptionsSchema.shape, T["shape"]>>
        : typeof baseSyncOptionsSchema);

  return z.object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(256, "Name must be less than 256 characters"),
    description: z.string().optional(),
    isAutoSyncEnabled: z.boolean().default(true),
    subscriberId: z.string().nullable().optional(),
    certificateIds: z.array(z.string()).optional(),
    connection: z.object({
      id: z.string().uuid("Invalid connection ID format"),
      name: z.string().max(255, "Connection name must be less than 255 characters")
    }),
    syncOptions: syncOptionsSchema
  });
};

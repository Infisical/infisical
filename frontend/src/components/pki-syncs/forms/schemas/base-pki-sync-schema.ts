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
      .optional()
      .refine(
        (val) => {
          if (!val) return true;

          const allowedOptionalPlaceholders = ["{{environment}}"];

          const allowedPlaceholdersRegexPart = ["{{certificateId}}", ...allowedOptionalPlaceholders]
            .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")) // Escape regex special characters
            .join("|");

          const allowedContentRegex = new RegExp(
            `^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`
          );
          const contentIsValid = allowedContentRegex.test(val);

          if (val.trim()) {
            const certificateIdRegex = /\{\{certificateId\}\}/;
            const certificateIdIsPresent = certificateIdRegex.test(val);
            return contentIsValid && certificateIdIsPresent;
          }

          return contentIsValid;
        },
        {
          message:
            "Certificate name schema must include exactly one {{certificateId}} placeholder. It can also include {{environment}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders."
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

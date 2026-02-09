import { AnyZodObject, z } from "zod";

import { SecretSyncInitialSyncBehavior } from "@app/hooks/api/secretSyncs";
import { slugSchema } from "@app/lib/schemas";

export const BaseSecretSyncSchema = <T extends AnyZodObject | undefined = undefined>(
  additionalSyncOptions?: T
) => {
  const baseSyncOptionsSchema = z.object({
    initialSyncBehavior: z.nativeEnum(SecretSyncInitialSyncBehavior),
    disableSecretDeletion: z.boolean().optional().default(false),
    keySchema: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;

          const allowedOptionalPlaceholders = ["{{environment}}"];

          const allowedPlaceholdersRegexPart = ["{{secretKey}}", ...allowedOptionalPlaceholders]
            .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")) // Escape regex special characters
            .join("|");

          const allowedContentRegex = new RegExp(
            `^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`
          );
          const contentIsValid = allowedContentRegex.test(val);

          const secretKeyCount = (val.match(/\{\{secretKey\}\}/g) || []).length;

          return contentIsValid && secretKeyCount === 1;
        },
        {
          message:
            "Key schema must include exactly one {{secretKey}} placeholder. It can also include {{environment}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders."
        }
      )
  });

  const syncOptionsSchema = additionalSyncOptions
    ? baseSyncOptionsSchema.merge(additionalSyncOptions)
    : (baseSyncOptionsSchema as T extends AnyZodObject
        ? z.ZodObject<z.objectUtil.MergeShapes<typeof baseSyncOptionsSchema.shape, T["shape"]>>
        : typeof baseSyncOptionsSchema);

  return z.object({
    name: slugSchema({ field: "Name", max: 256 }),
    description: z.string().trim().max(256, "Cannot exceed 256 characters").optional(),
    connection: z.object({ name: z.string(), id: z.string().uuid() }),
    environment: z.object({ slug: z.string(), id: z.string(), name: z.string() }),
    secretPath: z.string().min(1, "Secret path required"),
    syncOptions: syncOptionsSchema,
    isAutoSyncEnabled: z.boolean()
  });
};

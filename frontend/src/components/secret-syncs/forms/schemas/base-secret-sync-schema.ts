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
        (val) =>
          !val || /^(?:[a-zA-Z0-9_\-/]*)(?:\{\{secretKey\}\})(?:[a-zA-Z0-9_\-/]*)$/.test(val),
        {
          message:
            "Key schema must include one {{secretKey}} and only contain letters, numbers, dashes, underscores, slashes, and the {{secretKey}} placeholder."
        }
      )
  });

  const syncOptionsSchema = additionalSyncOptions
    ? baseSyncOptionsSchema.merge(additionalSyncOptions)
    : (baseSyncOptionsSchema as T extends AnyZodObject
        ? z.ZodObject<z.objectUtil.MergeShapes<typeof baseSyncOptionsSchema.shape, T["shape"]>>
        : typeof baseSyncOptionsSchema);

  return z.object({
    name: slugSchema({ field: "Name" }),
    description: z.string().trim().max(256, "Cannot exceed 256 characters").optional(),
    connection: z.object({ name: z.string(), id: z.string().uuid() }),
    environment: z.object({ slug: z.string(), id: z.string(), name: z.string() }),
    secretPath: z.string().min(1, "Secret path required"),
    syncOptions: syncOptionsSchema,
    isAutoSyncEnabled: z.boolean()
  });
};

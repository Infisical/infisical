import RE2 from "re2";
import { AnyZodObject, z } from "zod";

import { SecretSyncsSchema } from "@app/db/schemas/secret-syncs";
import { SecretSyncs } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { slugSchema } from "@app/server/lib/schemas";
import { SecretSync, SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_CONNECTION_MAP, SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

// Importing would need to write each secret back into the subfolder it came from, which we don't
// support yet (hierarchical writes to destinations that can represent folders are planned for a
// later PR). Until then, allowing this combination would silently squash every subfolder's
// secrets into the sync's root folder, restructuring the user's existing secrets tree.
const RECURSIVE_SYNC_REFINEMENT = {
  path: ["recursive"],
  message:
    "A sync that includes subfolders cannot also import existing secrets from the destination, because there is no single folder to import them into. Turn off subfolders, or set the first sync to overwrite the destination."
};

const isRecursiveCombinationAllowed = (options: { recursive?: unknown; initialSyncBehavior?: unknown }) =>
  !options.recursive || options.initialSyncBehavior === SecretSyncInitialSyncBehavior.OverwriteDestination;

const BaseSyncOptionsSchema = <T extends AnyZodObject | undefined = undefined>({
  destination,
  syncOptionsConfig: { canImportSecrets, supportsKeySchema = true, supportsDisableSecretDeletion = true },
  merge,
  isUpdateSchema
}: {
  destination: SecretSync;
  syncOptionsConfig: TSyncOptionsConfig;
  merge?: T;
  isUpdateSchema?: boolean;
}) => {
  const syncName = SECRET_SYNC_NAME_MAP[destination];

  const baseSchema = z.object({
    initialSyncBehavior: (canImportSecrets
      ? z.nativeEnum(SecretSyncInitialSyncBehavior)
      : z.literal(SecretSyncInitialSyncBehavior.OverwriteDestination)
    ).describe(SecretSyncs.SYNC_OPTIONS(destination).initialSyncBehavior),
    keySchema: supportsKeySchema
      ? z
          .string()
          .optional()
          .refine(
            (val) => {
              if (!val) return true;

              const allowedOptionalPlaceholders = ["{{environment}}"];

              const allowedPlaceholdersRegexPart = ["{{secretKey}}", ...allowedOptionalPlaceholders]
                .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")) // Escape regex special characters
                .join("|");

              const allowedContentRegex = new RE2(`^([a-zA-Z0-9_\\-/]|${allowedPlaceholdersRegexPart})*$`);
              const contentIsValid = allowedContentRegex.test(val);

              // Check if {{secretKey}} is present
              const secretKeyRegex = new RE2(/\{\{secretKey\}\}/);
              const secretKeyIsPresent = secretKeyRegex.test(val);

              return contentIsValid && secretKeyIsPresent;
            },
            {
              message:
                "Key schema must include exactly one {{secretKey}} placeholder. It can also include {{environment}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed besides the placeholders."
            }
          )
          .describe(SecretSyncs.SYNC_OPTIONS(destination).keySchema)
      : z
          .string()
          .optional()
          .transform(() => undefined)
          .describe(`Not supported for ${syncName} syncs.`),
    disableSecretDeletion: supportsDisableSecretDeletion
      ? z.boolean().optional().describe(SecretSyncs.SYNC_OPTIONS(destination).disableSecretDeletion)
      : z.literal(false).or(z.undefined()).describe(`Not supported for ${syncName} syncs.`),
    recursive: z.boolean().optional().describe(SecretSyncs.SYNC_OPTIONS(destination).recursive)
  });

  // What refinedSchema actually is: baseSchema, merged with the destination's own extra
  // sync-option fields when `merge` supplies them, wrapped in a Zod effect that enforces
  // isRecursiveCombinationAllowed across the result.
  type TRefinedSchema = z.ZodEffects<
    T extends AnyZodObject
      ? z.ZodObject<z.objectUtil.MergeShapes<typeof baseSchema.shape, T["shape"]>>
      : typeof baseSchema
  >;

  // The cast below is needed because TypeScript can't verify it on its own: every caller passes
  // `merge` and a real T together or neither, so the runtime ternary and the type-level ternary
  // above always agree, but the compiler has no way to prove that from a runtime value.
  const refinedSchema = (
    merge
      ? baseSchema.merge(merge).refine(isRecursiveCombinationAllowed, RECURSIVE_SYNC_REFINEMENT)
      : baseSchema.refine(isRecursiveCombinationAllowed, RECURSIVE_SYNC_REFINEMENT)
  ) as TRefinedSchema;

  return refinedSchema.describe(
    isUpdateSchema ? SecretSyncs.UPDATE(destination).syncOptions : SecretSyncs.CREATE(destination).syncOptions
  );
};

export const BaseSecretSyncSchema = <T extends AnyZodObject | undefined = undefined>(
  destination: SecretSync,
  syncOptionsConfig: TSyncOptionsConfig,
  merge?: T
) =>
  SecretSyncsSchema.omit({
    destination: true,
    destinationConfig: true,
    syncOptions: true
  }).extend({
    // destination needs to be on the extended object for type differentiation
    syncOptions: BaseSyncOptionsSchema({ destination, syncOptionsConfig, merge }),
    // join properties
    projectId: z.string(),
    connection: z.object({
      app: z.literal(SECRET_SYNC_CONNECTION_MAP[destination]),
      name: z.string(),
      id: z.string().uuid()
    }),
    environment: z.object({ slug: z.string(), name: z.string(), id: z.string().uuid() }).nullable(),
    folder: z.object({ id: z.string(), path: z.string() }).nullable()
  });

export const GenericCreateSecretSyncFieldsSchema = <T extends AnyZodObject | undefined = undefined>(
  destination: SecretSync,
  syncOptionsConfig: TSyncOptionsConfig,
  merge?: T
) =>
  z.object({
    name: slugSchema({ field: "name", max: 256 }).describe(SecretSyncs.CREATE(destination).name),
    projectId: z.string().trim().min(1, "Project ID required").describe(SecretSyncs.CREATE(destination).projectId),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretSyncs.CREATE(destination).description),
    connectionId: z.string().uuid().describe(SecretSyncs.CREATE(destination).connectionId),
    environment: slugSchema({ field: "environment", max: 64 }).describe(SecretSyncs.CREATE(destination).environment),
    secretPath: z
      .string()
      .trim()
      .min(1, "Secret path required")
      .transform(removeTrailingSlash)
      .describe(SecretSyncs.CREATE(destination).secretPath),
    isAutoSyncEnabled: z.boolean().default(true).describe(SecretSyncs.CREATE(destination).isAutoSyncEnabled),
    syncOptions: BaseSyncOptionsSchema({ destination, syncOptionsConfig, merge })
  });

export const GenericUpdateSecretSyncFieldsSchema = <T extends AnyZodObject | undefined = undefined>(
  destination: SecretSync,
  syncOptionsConfig: TSyncOptionsConfig,
  merge?: T
) =>
  z.object({
    name: slugSchema({ field: "name", max: 256 }).describe(SecretSyncs.UPDATE(destination).name).optional(),
    connectionId: z.string().uuid().describe(SecretSyncs.UPDATE(destination).connectionId).optional(),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretSyncs.UPDATE(destination).description),
    environment: slugSchema({ field: "environment", max: 64 })
      .optional()
      .describe(SecretSyncs.UPDATE(destination).environment),
    secretPath: z
      .string()
      .trim()
      .min(1, "Invalid secret path")
      .transform(removeTrailingSlash)
      .optional()
      .describe(SecretSyncs.UPDATE(destination).secretPath),
    isAutoSyncEnabled: z.boolean().optional().describe(SecretSyncs.UPDATE(destination).isAutoSyncEnabled),
    // Optional like every other field here, so an update can touch just the name or description
    // without resending sync options. This can't be used to sneak past
    // isRecursiveCombinationAllowed: initialSyncBehavior inside BaseSyncOptionsSchema stays
    // required, so a request that includes syncOptions at all must still submit a complete,
    // valid one.
    syncOptions: BaseSyncOptionsSchema({ destination, syncOptionsConfig, merge, isUpdateSchema: true }).optional()
  });

import { z } from "zod";

import { SecretType } from "@app/db/schemas";
import { DASHBOARD } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { slugSchema } from "@app/server/lib/schemas";

const docs = DASHBOARD.SECRET_METADATA_LIST;
const ProjectIdSchema = z.union([
  z.string().trim().uuid(),
  z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, "Project ID must be a UUID or legacy MongoDB ObjectId")
]);

export const SecretMetadataQuerySchema = z.object({
  projectId: ProjectIdSchema.describe(docs.projectId),
  environment: slugSchema({ field: "Environment slug" }).describe(docs.environment),
  secretPath: z
    .string()
    .trim()
    .min(1)
    .max(6144)
    .regex(/^\/[^\0]*$/, "Secret path must be an absolute folder path")
    .default("/")
    .transform(removeTrailingSlash)
    .describe(docs.secretPath),
  cursor: z.string().trim().uuid().optional().describe(docs.cursor),
  limit: z.coerce.number().int().min(1).max(500).default(500).describe(docs.limit)
});

export const SecretMetadataResponseSchema = z.object({
  secrets: z
    .object({
      id: z.string().uuid().describe(docs.id),
      secretKey: z.string().describe(docs.secretKey),
      secretPath: z.string().describe(docs.path),
      type: z.nativeEnum(SecretType).describe(docs.type),
      isHoneyTokenSecret: z.boolean().describe(docs.isHoneyTokenSecret),
      isRotatedSecret: z.boolean().describe(docs.isRotatedSecret),
      secretValueHidden: z.boolean().describe(docs.secretValueHidden)
    })
    .array()
    .describe(docs.secrets),
  nextCursor: z.string().uuid().nullable().describe(docs.nextCursor)
});

import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreatePamAccountSchema,
  BaseCreatePamResourceSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdatePamAccountSchema,
  BaseUpdatePamResourceSchema
} from "../pam-resource-schemas";

export const McpResourceConnectionDetailsSchema = z.object({
  url: z.string().url()
});
export const McpAccountCredentialsSchema = z.object({
  token: z
    .object({
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresIn: z.number()
    })
    .optional(),
  headers: z
    .object({
      key: z.string(),
      value: z.string()
    })
    .array()
    .optional()
});

// Resources
const BaseMcpResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.Mcp) });

export const McpResourceSchema = BaseMcpResourceSchema.extend({
  connectionDetails: McpResourceConnectionDetailsSchema,
  rotationAccountCredentials: z.null().optional()
});

export const SanitizedMcpResourceSchema = BaseMcpResourceSchema.extend({
  connectionDetails: McpResourceConnectionDetailsSchema,
  rotationAccountCredentials: z.null().optional()
});

export const McpResourceListItemSchema = z.object({
  name: z.literal("MCP"),
  resource: z.literal(PamResource.Mcp)
});

export const CreateMcpResourceSchema = BaseCreatePamResourceSchema.extend({
  gatewayId: z.string().nullish(),
  connectionDetails: McpResourceConnectionDetailsSchema,
  rotationAccountCredentials: z.null().optional()
});

export const UpdateMcpResourceSchema = BaseUpdatePamResourceSchema.extend({
  gatewayId: z.string().nullish(),
  connectionDetails: McpResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: z.null().optional()
});

// Accounts
export const McpAccountSchema = BasePamAccountSchema.extend({
  credentials: McpAccountCredentialsSchema
});

export const CreateMcpAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: McpAccountCredentialsSchema.omit({ token: true })
});

export const UpdateMcpAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: McpAccountCredentialsSchema.omit({ token: true }).optional()
});

export const SanitizedMcpAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  credentials: McpAccountCredentialsSchema.pick({})
});

// Sessions
export const McpSessionCredentialsSchema = McpResourceConnectionDetailsSchema.and(McpAccountCredentialsSchema);

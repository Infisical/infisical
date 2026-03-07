import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreateGatewayPamResourceSchema,
  BaseCreatePamAccountSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdateGatewayPamResourceSchema,
  BaseUpdatePamAccountSchema
} from "../pam-resource-schemas";

// Resources
export const WebAppResourceConnectionDetailsSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(
      (val) => {
        try {
          const url = new URL(val);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Must be a valid HTTP or HTTPS URL" }
    )
});

const BaseWebAppResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.WebApp) });

export const WebAppResourceSchema = BaseWebAppResourceSchema.extend({
  connectionDetails: WebAppResourceConnectionDetailsSchema
});

export const SanitizedWebAppResourceSchema = BaseWebAppResourceSchema.extend({
  connectionDetails: WebAppResourceConnectionDetailsSchema
});

export const WebAppResourceListItemSchema = z.object({
  name: z.literal("Web Application"),
  resource: z.literal(PamResource.WebApp)
});

export const CreateWebAppResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: WebAppResourceConnectionDetailsSchema
});

export const UpdateWebAppResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: WebAppResourceConnectionDetailsSchema.optional()
});

// Accounts
// WebApp accounts are lightweight — no credentials needed.
// The account serves as a named access entry for session management.
export const WebAppAccountCredentialsSchema = z.object({});

export const WebAppAccountSchema = BasePamAccountSchema.extend({
  credentials: WebAppAccountCredentialsSchema
});

export const CreateWebAppAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: WebAppAccountCredentialsSchema.default({})
});

export const UpdateWebAppAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: WebAppAccountCredentialsSchema.optional()
});

export const SanitizedWebAppAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  resourceType: z.literal(PamResource.WebApp),
  credentials: WebAppAccountCredentialsSchema
});

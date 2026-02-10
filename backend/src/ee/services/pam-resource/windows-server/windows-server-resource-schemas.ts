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
import { WindowsAccountType, WindowsProtocol } from "./windows-server-resource-enums";

// Resources
const BaseWindowsResourceSchema = BasePamResourceSchema.extend({
  resourceType: z.literal(PamResource.Windows)
});

export const WindowsResourceListItemSchema = z.object({
  name: z.literal("Windows Server"),
  resource: z.literal(PamResource.Windows)
});

export const WindowsResourceConnectionDetailsSchema = z.object({
  protocol: z.literal(WindowsProtocol.RDP),
  hostname: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535)
});

// Credentials (username + password for RDP)
export const WindowsAccountCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(255)
});

// Account metadata
export const WindowsAccountMetadataSchema = z.object({
  accountType: z.nativeEnum(WindowsAccountType)
});

export const WindowsResourceSchema = BaseWindowsResourceSchema.extend({
  connectionDetails: WindowsResourceConnectionDetailsSchema,
  rotationAccountCredentials: WindowsAccountCredentialsSchema.nullable().optional()
});

export const SanitizedWindowsResourceSchema = BaseWindowsResourceSchema.extend({
  connectionDetails: WindowsResourceConnectionDetailsSchema,
  rotationAccountCredentials: z
    .object({
      username: z.string()
    })
    .nullable()
    .optional()
});

export const CreateWindowsResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: WindowsResourceConnectionDetailsSchema,
  rotationAccountCredentials: WindowsAccountCredentialsSchema.nullable().optional()
});

export const UpdateWindowsResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: WindowsResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: WindowsAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const WindowsAccountSchema = BasePamAccountSchema.extend({
  credentials: WindowsAccountCredentialsSchema,
  metadata: WindowsAccountMetadataSchema
});

export const CreateWindowsAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: WindowsAccountCredentialsSchema,
  metadata: WindowsAccountMetadataSchema
});

export const UpdateWindowsAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: WindowsAccountCredentialsSchema.optional(),
  metadata: WindowsAccountMetadataSchema.optional()
});

export const SanitizedWindowsAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  credentials: z.object({
    username: z.string()
  }),
  metadata: WindowsAccountMetadataSchema
});

// Sessions
export const WindowsSessionCredentialsSchema = WindowsResourceConnectionDetailsSchema.and(
  WindowsAccountCredentialsSchema
);

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
  port: z.coerce.number().int().min(1).max(65535),

  // WinRM config — used for rotation only, configured in the rotation policy modal
  winrmPort: z.coerce.number().int().min(1).max(65535),
  useWinrmHttps: z.boolean(),
  winrmRejectUnauthorized: z.boolean(),
  winrmCaCert: z
    .string()
    .trim()
    .transform((val) => val || undefined)
    .optional(),
  winrmTlsServerName: z
    .string()
    .trim()
    .transform((val) => val || undefined)
    .optional()
});

// Credentials (username + password for RDP)
export const WindowsAccountCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(255)
});

// Account metadata
export const WindowsAccountMetadataSchema = z.object({
  accountType: z.nativeEnum(WindowsAccountType),
  lastLogon: z.string().optional(),
  passwordLastSet: z.string().optional(),
  sid: z.string().optional(),
  enabled: z.boolean().optional()
});

// Resource Metadata
export const WindowsResourceInternalMetadataSchema = z.object({
  osVersion: z.string().optional(),
  osVersionDetail: z.string().optional()
});

export const SanitizedWindowsResourceInternalMetadataSchema = WindowsResourceInternalMetadataSchema.pick({
  osVersion: true,
  osVersionDetail: true
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
  rotationAccountCredentials: WindowsAccountCredentialsSchema.nullable().optional(),
  domainId: z.string().uuid().nullable().optional()
});

export const UpdateWindowsResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: WindowsResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: WindowsAccountCredentialsSchema.nullable().optional(),
  domainId: z.string().uuid().nullable().optional()
});

// Accounts
export const WindowsAccountSchema = BasePamAccountSchema.extend({
  credentials: WindowsAccountCredentialsSchema,
  internalMetadata: WindowsAccountMetadataSchema
});

export const CreateWindowsAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: WindowsAccountCredentialsSchema,
  internalMetadata: WindowsAccountMetadataSchema
});

export const UpdateWindowsAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: WindowsAccountCredentialsSchema.optional(),
  internalMetadata: WindowsAccountMetadataSchema.optional()
});

export const SanitizedWindowsAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  parentType: z.literal(PamResource.Windows),
  credentials: z.object({
    username: z.string()
  }),
  internalMetadata: WindowsAccountMetadataSchema
});

// Sessions
export const WindowsSessionCredentialsSchema = WindowsResourceConnectionDetailsSchema.and(
  WindowsAccountCredentialsSchema
);

import { z } from "zod";

import { PamAccountsSchema, PamResourcesSchema } from "@app/db/schemas";
import { slugSchema } from "@app/server/lib/schemas";

export const GatewayAccessResponseSchema = z.object({
  sessionId: z.string(),
  relayClientCertificate: z.string(),
  relayClientPrivateKey: z.string(),
  relayServerCertificateChain: z.string(),
  gatewayClientCertificate: z.string(),
  gatewayClientPrivateKey: z.string(),
  gatewayServerCertificateChain: z.string(),
  relayHost: z.string(),
  metadata: z.record(z.string(), z.string().optional()).optional()
});

// Resources
export const BasePamResourceSchema = PamResourcesSchema.omit({
  encryptedConnectionDetails: true,
  encryptedRotationAccountCredentials: true,
  resourceType: true
});

const CoreCreatePamResourceSchema = z.object({
  projectId: z.string().uuid(),
  name: slugSchema({ field: "name" })
});

export const BaseCreateGatewayPamResourceSchema = CoreCreatePamResourceSchema.extend({
  gatewayId: z.string().uuid()
});

export const BaseCreatePamResourceSchema = CoreCreatePamResourceSchema;

const CoreUpdatePamResourceSchema = z.object({
  name: slugSchema({ field: "name" }).optional()
});

export const BaseUpdateGatewayPamResourceSchema = CoreUpdatePamResourceSchema.extend({
  gatewayId: z.string().uuid().optional()
});

export const BaseUpdatePamResourceSchema = CoreUpdatePamResourceSchema;

// Accounts
export const BasePamAccountSchema = PamAccountsSchema.omit({
  encryptedCredentials: true
});

export const BasePamAccountSchemaWithResource = BasePamAccountSchema.extend({
  resource: PamResourcesSchema.pick({
    id: true,
    name: true,
    resourceType: true
  }).extend({
    rotationCredentialsConfigured: z.boolean()
  }),
  lastRotationMessage: z.string().nullable().optional(),
  rotationStatus: z.string().nullable().optional()
});

export const BaseCreatePamAccountSchema = z.object({
  resourceId: z.string().uuid(),
  folderId: z.string().uuid().optional(),
  name: slugSchema({ field: "name" }),
  description: z.string().max(512).nullable().optional(),
  rotationEnabled: z.boolean(),
  rotationIntervalSeconds: z.number().min(3600).nullable().optional()
});

export const BaseUpdatePamAccountSchema = z.object({
  name: slugSchema({ field: "name" }).optional(),
  description: z.string().max(512).nullable().optional(),
  rotationEnabled: z.boolean().optional(),
  rotationIntervalSeconds: z.number().min(3600).nullable().optional()
});

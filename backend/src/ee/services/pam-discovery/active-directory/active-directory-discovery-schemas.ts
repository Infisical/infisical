import { z } from "zod";

import { PamDiscoveryType } from "../pam-discovery-enums";
import {
  BaseCreatePamDiscoverySourceSchema,
  BasePamDiscoverySourceRunSchema,
  BasePamDiscoverySourceSchema,
  BaseUpdatePamDiscoverySourceSchema
} from "../pam-discovery-schemas";

// Discovery Source
const BaseActiveDirectoryDiscoverySourceSchema = BasePamDiscoverySourceSchema.extend({
  discoveryType: z.literal(PamDiscoveryType.ActiveDirectory)
});

export const ActiveDirectoryDiscoveryListItemSchema = z.object({
  name: z.literal("Active Directory"),
  discoveryType: z.literal(PamDiscoveryType.ActiveDirectory)
});

export const ActiveDirectoryDiscoveryConfigurationSchema = z.object({
  domainFQDN: z.string().trim().min(1).max(255),
  dcAddress: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535)
});

export const ActiveDirectoryDiscoveryCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(255)
});

export const ActiveDirectoryDiscoverySourceSchema = BaseActiveDirectoryDiscoverySourceSchema.extend({
  discoveryConfiguration: ActiveDirectoryDiscoveryConfigurationSchema,
  discoveryCredentials: ActiveDirectoryDiscoveryCredentialsSchema
});

export const SanitizedActiveDirectoryDiscoverySourceSchema = BaseActiveDirectoryDiscoverySourceSchema.extend({
  discoveryConfiguration: ActiveDirectoryDiscoveryConfigurationSchema,
  discoveryCredentials: ActiveDirectoryDiscoveryCredentialsSchema.pick({
    username: true
  })
});

export const CreateActiveDirectoryDiscoverySourceSchema = BaseCreatePamDiscoverySourceSchema.extend({
  discoveryConfiguration: ActiveDirectoryDiscoveryConfigurationSchema,
  discoveryCredentials: ActiveDirectoryDiscoveryCredentialsSchema
});

export const UpdateActiveDirectoryDiscoverySourceSchema = BaseUpdatePamDiscoverySourceSchema.extend({
  discoveryConfiguration: ActiveDirectoryDiscoveryConfigurationSchema.optional(),
  discoveryCredentials: ActiveDirectoryDiscoveryCredentialsSchema.optional()
});

// Discovery Run
export const ActiveDirectoryDiscoverySourceRunProgressSchema = z.object({
  adEnumeration: z
    .object({
      status: z.enum(["running", "completed", "failed"]),
      completedAt: z.string().optional(),
      error: z.string().optional()
    })
    .optional(),
  dependencyScan: z
    .object({
      status: z.enum(["running", "completed", "failed", "skipped"]),
      totalMachines: z.number().optional(),
      scannedMachines: z.number().optional(),
      failedMachines: z.number().optional(),
      reason: z.string().optional()
    })
    .optional(),
  machineErrors: z.record(z.string(), z.string()).optional()
});

export const ActiveDirectoryDiscoverySourceRunSchema = BasePamDiscoverySourceRunSchema.extend({
  progress: ActiveDirectoryDiscoverySourceRunProgressSchema
});

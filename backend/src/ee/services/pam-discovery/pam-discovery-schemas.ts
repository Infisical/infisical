import { z } from "zod";

import {
  PamDiscoverySourceAccountsSchema,
  PamDiscoverySourceResourcesSchema,
  PamDiscoverySourceRunsSchema,
  PamDiscoverySourcesSchema
} from "@app/db/schemas";
import { slugSchema } from "@app/server/lib/schemas";

import { ActiveDirectoryAccountMetadataSchema } from "../pam-resource/active-directory/active-directory-resource-schemas";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { SSHResourceMetadataSchema } from "../pam-resource/ssh/ssh-resource-schemas";
import {
  WindowsAccountMetadataSchema,
  WindowsResourceMetadataSchema
} from "../pam-resource/windows-server/windows-server-resource-schemas";
import {
  PamDiscoverySchedule,
  PamDiscoverySourceRunStatus,
  PamDiscoverySourceRunTrigger,
  PamDiscoverySourceStatus
} from "./pam-discovery-enums";

// Discovery Sources
export const BasePamDiscoverySourceSchema = PamDiscoverySourcesSchema.omit({
  discoveryType: true,
  discoveryConfiguration: true,
  encryptedDiscoveryCredentials: true
}).extend({
  schedule: z.nativeEnum(PamDiscoverySchedule),
  status: z.nativeEnum(PamDiscoverySourceStatus)
});

export const BaseCreatePamDiscoverySourceSchema = z.object({
  projectId: z.string().uuid(),
  name: slugSchema({ field: "name" }),
  gatewayId: z.string().uuid(),
  schedule: z.nativeEnum(PamDiscoverySchedule)
});

export const BaseUpdatePamDiscoverySourceSchema = z.object({
  name: slugSchema({ field: "name" }).optional(),
  gatewayId: z.string().uuid().optional(),
  schedule: z.nativeEnum(PamDiscoverySchedule).optional()
});

// Discovery Runs
export const BasePamDiscoverySourceRunSchema = PamDiscoverySourceRunsSchema.omit({
  progress: true
}).extend({
  status: z.nativeEnum(PamDiscoverySourceRunStatus),
  triggeredBy: z.nativeEnum(PamDiscoverySourceRunTrigger)
});

export const DiscoveredResourceSchema = PamDiscoverySourceResourcesSchema.extend({
  resourceName: z.string(),
  resourceType: z.nativeEnum(PamResource),
  resourceMetadata: z.union([SSHResourceMetadataSchema, WindowsResourceMetadataSchema]).optional()
});

export const DiscoveredAccountSchema = PamDiscoverySourceAccountsSchema.extend({
  resourceType: z.nativeEnum(PamResource),
  resourceName: z.string(),
  resourceId: z.string().uuid(),
  accountName: z.string(),
  metadata: z.union([ActiveDirectoryAccountMetadataSchema, WindowsAccountMetadataSchema])
});

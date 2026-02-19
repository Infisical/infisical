import { z } from "zod";

import {
  PamDiscoveryRunsSchema,
  PamDiscoverySourceAccountsSchema,
  PamDiscoverySourceResourcesSchema,
  PamDiscoverySourcesSchema
} from "@app/db/schemas";
import { slugSchema } from "@app/server/lib/schemas";

import { ActiveDirectoryAccountMetadataSchema } from "../pam-resource/active-directory/active-directory-resource-schemas";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { WindowsAccountMetadataSchema } from "../pam-resource/windows-server/windows-server-resource-schemas";
import {
  PamDiscoveryRunStatus,
  PamDiscoveryRunTrigger,
  PamDiscoverySchedule,
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
export const BasePamDiscoverySourceRunSchema = PamDiscoveryRunsSchema.omit({
  progress: true
}).extend({
  status: z.nativeEnum(PamDiscoveryRunStatus),
  triggeredBy: z.nativeEnum(PamDiscoveryRunTrigger)
});

export const DiscoveredResourceSchema = PamDiscoverySourceResourcesSchema.extend({
  resourceName: z.string(),
  resourceType: z.nativeEnum(PamResource)
});

export const DiscoveredAccountSchema = PamDiscoverySourceAccountsSchema.extend({
  resourceType: z.nativeEnum(PamResource),
  resourceName: z.string(),
  resourceId: z.string().uuid(),
  accountName: z.string(),
  metadata: z.union([ActiveDirectoryAccountMetadataSchema, WindowsAccountMetadataSchema])
});

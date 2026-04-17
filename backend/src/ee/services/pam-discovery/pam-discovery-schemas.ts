import { z } from "zod";

import {
  PamDiscoverySourceAccountsSchema,
  PamDiscoverySourceResourcesSchema,
  PamDiscoverySourceRunsSchema,
  PamDiscoverySourcesSchema
} from "@app/db/schemas";
import { slugSchema } from "@app/server/lib/schemas";

import { ActiveDirectoryAccountMetadataSchema } from "../pam-domain/active-directory/active-directory-domain-schemas";
import { PamDomainType } from "../pam-domain/pam-domain-enums";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { SanitizedSSHResourceInternalMetadataSchema } from "../pam-resource/ssh/ssh-resource-schemas";
import {
  SanitizedWindowsResourceInternalMetadataSchema,
  WindowsAccountMetadataSchema
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
  resourceInternalMetadata: z
    .union([SanitizedSSHResourceInternalMetadataSchema, SanitizedWindowsResourceInternalMetadataSchema])
    .optional(),
  dependencyCount: z.number().default(0)
});

export const DiscoveredAccountSchema = PamDiscoverySourceAccountsSchema.extend({
  resourceType: z.nativeEnum(PamResource).nullable().optional(),
  resourceName: z.string().nullable().optional(),
  resourceId: z.string().uuid().nullable().optional(),
  domainType: z.nativeEnum(PamDomainType).nullable().optional(),
  domainName: z.string().nullable().optional(),
  domainId: z.string().uuid().nullable().optional(),
  accountName: z.string(),
  internalMetadata: z.union([ActiveDirectoryAccountMetadataSchema, WindowsAccountMetadataSchema]),
  dependencyCount: z.number().default(0)
});

import { z } from "zod";

import { PamDomainsSchema, ResourceMetadataSchema } from "@app/db/schemas";
import { slugSchema } from "@app/server/lib/schemas";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";

import { ActiveDirectoryConnectionDetailsSchema } from "./active-directory/active-directory-domain-schemas";
import { PamDomainType } from "./pam-domain-enums";

export const BasePamDomainSchema = PamDomainsSchema.omit({
  encryptedConnectionDetails: true,
  domainType: true
}).extend({
  metadata: ResourceMetadataSchema.pick({ id: true, key: true, value: true }).array().optional()
});

export const ActiveDirectoryDomainListItemSchema = z.object({
  name: z.literal("Active Directory"),
  domain: z.literal(PamDomainType.ActiveDirectory)
});

const BaseActiveDirectoryDomainSchema = BasePamDomainSchema.extend({
  domainType: z.literal(PamDomainType.ActiveDirectory)
});

export const ActiveDirectoryDomainSchema = BaseActiveDirectoryDomainSchema.extend({
  connectionDetails: ActiveDirectoryConnectionDetailsSchema
});

export const SanitizedActiveDirectoryDomainSchema = BaseActiveDirectoryDomainSchema.extend({
  connectionDetails: ActiveDirectoryConnectionDetailsSchema
});

const CoreCreatePamDomainSchema = z.object({
  projectId: z.string().uuid(),
  name: slugSchema({ field: "name" }),
  metadata: ResourceMetadataNonEncryptionSchema.optional()
});

export const CreateActiveDirectoryDomainSchema = CoreCreatePamDomainSchema.extend({
  gatewayId: z.string().uuid(),
  connectionDetails: ActiveDirectoryConnectionDetailsSchema
});

const CoreUpdatePamDomainSchema = z.object({
  name: slugSchema({ field: "name" }).optional(),
  metadata: ResourceMetadataNonEncryptionSchema.optional()
});

export const UpdateActiveDirectoryDomainSchema = CoreUpdatePamDomainSchema.extend({
  gatewayId: z.string().uuid().optional(),
  connectionDetails: ActiveDirectoryConnectionDetailsSchema.optional()
});

export const SanitizedDomainSchema = z.discriminatedUnion("domainType", [SanitizedActiveDirectoryDomainSchema]);

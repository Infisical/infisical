import z from "zod";

import { CertificateAuthoritiesSchema } from "@app/db/schemas";
import { CertificateAuthorities } from "@app/lib/api-docs/constants";
import { slugSchema } from "@app/server/lib/schemas";

import { CaStatus, CaType } from "./certificate-authority-enums";

export const BaseCertificateAuthoritySchema = CertificateAuthoritiesSchema.pick({
  projectId: true,
  disableDirectIssuance: true,
  id: true
}).extend({
  name: z.string(),
  status: z.nativeEnum(CaStatus)
});

export const GenericCreateCertificateAuthorityFieldsSchema = (type: CaType) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(CertificateAuthorities.CREATE(type).name),
    projectId: z.string().trim().min(1, "Project ID required").describe(CertificateAuthorities.CREATE(type).projectId),
    disableDirectIssuance: z.boolean().describe(CertificateAuthorities.CREATE(type).disableDirectIssuance),
    status: z.nativeEnum(CaStatus).describe(CertificateAuthorities.CREATE(type).status)
  });

export const GenericUpdateCertificateAuthorityFieldsSchema = (type: CaType) =>
  z.object({
    name: slugSchema({ field: "name" }).optional().describe(CertificateAuthorities.UPDATE(type).name),
    disableDirectIssuance: z.boolean().optional().describe(CertificateAuthorities.UPDATE(type).disableDirectIssuance),
    status: z.nativeEnum(CaStatus).optional().describe(CertificateAuthorities.UPDATE(type).status)
  });

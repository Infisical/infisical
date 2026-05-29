import z from "zod";

import { CertificateAuthoritiesSchema } from "@app/db/schemas";
import { CertificateAuthorities } from "@app/lib/api-docs/constants";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";

import { CaStatus, CaType } from "./certificate-authority-enums";

export const BaseCertificateAuthoritySchema = CertificateAuthoritiesSchema.pick({
  projectId: true,
  enableDirectIssuance: true,
  name: true,
  id: true
}).extend({
  status: z.nativeEnum(CaStatus)
});

export const GenericCreateCertificateAuthorityFieldsSchema = (type: CaType) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(CertificateAuthorities.CREATE(type).name),
    projectId: z.string().uuid("Project ID must be valid").optional().describe(openApiHidden()),
    status: z.nativeEnum(CaStatus).describe(CertificateAuthorities.CREATE(type).status)
  });

export const GenericUpdateCertificateAuthorityFieldsSchema = (type: CaType) =>
  z.object({
    name: slugSchema({ field: "name" }).optional().describe(CertificateAuthorities.UPDATE(type).name),
    status: z.nativeEnum(CaStatus).optional().describe(CertificateAuthorities.UPDATE(type).status)
  });

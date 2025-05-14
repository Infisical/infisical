import z from "zod";

import { CertificateAuthoritiesSchema } from "@app/db/schemas";
import { slugSchema } from "@app/server/lib/schemas";

import { CaStatus, CaType } from "./certificate-authority-enums";

// SHEEN TODO: add description mapping using type
export const BaseCertificateAuthoritySchema = (type: CaType) =>
  CertificateAuthoritiesSchema.pick({
    projectId: true,
    disableDirectIssuance: true,
    id: true
  }).extend({
    name: z.string(),
    status: z.nativeEnum(CaStatus)
  });

export const GenericCreateCertificateAuthorityFieldsSchema = (type: CaType) =>
  z.object({
    name: slugSchema({ field: "name" }),
    projectId: z.string().trim().min(1, "Project ID required"),
    disableDirectIssuance: z.boolean(),
    status: z.nativeEnum(CaStatus)
  });

export const GenericUpdateCertificateAuthorityFieldsSchema = (type: CaType) =>
  z.object({
    name: slugSchema({ field: "name" }).optional(),
    disableDirectIssuance: z.boolean().optional(),
    status: z.nativeEnum(CaStatus).optional()
  });

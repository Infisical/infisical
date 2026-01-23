import z from "zod";

import { CertificateTemplatesSchema } from "@app/db/schemas/certificate-templates";

export const sanitizedCertificateTemplate = CertificateTemplatesSchema.pick({
  id: true,
  caId: true,
  name: true,
  commonName: true,
  subjectAlternativeName: true,
  pkiCollectionId: true,
  ttl: true,
  keyUsages: true,
  extendedKeyUsages: true
}).merge(
  z.object({
    projectId: z.string(),
    caName: z.string()
  })
);

export const sanitizedCertificateTemplateV2 = CertificateTemplatesSchema.pick({
  id: true,
  caId: true,
  name: true,
  commonName: true,
  subjectAlternativeName: true,
  pkiCollectionId: true,
  ttl: true,
  keyUsages: true,
  extendedKeyUsages: true
}).merge(
  z.object({
    projectId: z.string(),
    caName: z.string()
  })
);

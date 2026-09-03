import { z } from "zod";

import { CaType } from "@app/hooks/api/ca/enums";

import { getCertificateImportReference } from "./certificate-import-linkage";

export const certificateImportSchema = z
  .object({
    certificatePem: z.string().trim().min(1, "Certificate PEM is required"),
    privateKeyPem: z.string().trim().optional(),
    chainPem: z.string().trim().optional(),
    profileId: z.string().uuid().optional(),
    linkedCaType: z.nativeEnum(CaType).optional(),
    providerReference: z.string().trim().optional()
  })
  .superRefine((data, ctx) => {
    const reference = getCertificateImportReference(data.linkedCaType);
    if (!reference) return;

    if (!data.providerReference || !reference.parse(data.providerReference)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerReference"],
        message: reference.invalidMessage
      });
    }
  });

export type CertificateImportFormData = z.infer<typeof certificateImportSchema>;

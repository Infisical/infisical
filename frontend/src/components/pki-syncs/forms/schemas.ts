import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

export const PkiSyncFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().optional(),
  destination: z.nativeEnum(PkiSync),
  isAutoSyncEnabled: z.boolean().default(true),
  subscriberId: z.string().min(1, "PKI Subscriber is required"),
  connection: z.object({
    id: z.string(),
    name: z.string()
  }),
  destinationConfig: z.object({
    vaultBaseUrl: z.string().url("Valid URL is required")
  }),
  syncOptions: z.object({
    canImportCertificates: z.boolean().default(true),
    canRemoveCertificates: z.boolean().default(true)
  })
});

export type TPkiSyncForm = z.infer<typeof PkiSyncFormSchema>;

export const UpdatePkiSyncFormSchema = PkiSyncFormSchema.partial().merge(
  z.object({
    name: z.string().trim().min(1, "Name is required"),
    destination: z.nativeEnum(PkiSync),
    connection: z.object({
      id: z.string(),
      name: z.string()
    })
  })
);

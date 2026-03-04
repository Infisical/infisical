import z from "zod";

export const ResourceMetadataNonEncryptionSchema = z
  .object({
    key: z.string().trim().min(1).max(255),
    value: z.string().trim().max(1020).default("")
  })
  .array();

export const ResourceMetadataWithEncryptionSchema = z
  .object({
    key: z.string().trim().min(1).max(255),
    value: z.string().trim().max(1020).default(""),
    isEncrypted: z.boolean().optional().default(false)
  })
  .array();

export type ResourceMetadataDTO = z.infer<typeof ResourceMetadataNonEncryptionSchema>;
export type ResourceMetadataWithEncryptionDTO = z.infer<typeof ResourceMetadataWithEncryptionSchema>;

import z from "zod";

export const ResourceMetadataNonEncryptionSchema = z
  .object({
    key: z.string().trim().min(1),
    value: z.string().trim().default("")
  })
  .array();

export const ResourceMetadataWithEncryptionSchema = z
  .object({
    key: z.string().trim().min(1),
    value: z.string().trim().default(""),
    isEncrypted: z.boolean().optional().default(false)
  })
  .array();

export type ResourceMetadataDTO = z.infer<typeof ResourceMetadataNonEncryptionSchema>;
export type ResourceMetadataWithEncryptionDTO = z.infer<typeof ResourceMetadataWithEncryptionSchema>;

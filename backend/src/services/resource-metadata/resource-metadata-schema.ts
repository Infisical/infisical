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

// Request bodies only: responses are validated too, and secrets written before this limit can hold more entries.
export const SecretMetadataInputSchema = ResourceMetadataWithEncryptionSchema.max(
  50,
  "A secret can have at most 50 metadata entries"
);

export type ResourceMetadataDTO = z.infer<typeof ResourceMetadataNonEncryptionSchema>;
export type ResourceMetadataWithEncryptionDTO = z.infer<typeof ResourceMetadataWithEncryptionSchema>;

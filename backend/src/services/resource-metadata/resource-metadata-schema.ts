import z from "zod";

export const ResourceMetadataSchema = z
  .object({
    key: z.string().trim().min(1),
    value: z.string().trim().default("")
  })
  .array();

export type ResourceMetadataDTO = z.infer<typeof ResourceMetadataSchema>;

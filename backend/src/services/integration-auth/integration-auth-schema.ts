import { z } from "zod";

export const IntegrationAuthMetadataSchema = z.object({
  installationId: z.string().optional()
});

export type TIntegrationAuthMetadata = z.infer<typeof IntegrationAuthMetadataSchema>;

import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DatabricksSyncDestinationSchema = z.object({
  destination: z.literal(SecretSync.Databricks),
  destinationConfig: z.object({
    scope: z.string().trim().min(1, "Databricks scope required")
  })
});

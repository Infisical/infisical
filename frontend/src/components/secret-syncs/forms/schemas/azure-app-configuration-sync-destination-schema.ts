import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureAppConfigurationSyncDestinationSchema = z.object({
  destination: z.literal(SecretSync.AzureAppConfiguration),
  destinationConfig: z.object({
    configurationUrl: z
      .string()
      .trim()
      .min(1, { message: "Azure App Configuration URL is required" })
      .url()
      .refine(
        (val) => val.endsWith(".azconfig.io"),
        "URL should have the following format: https://resource-name-here.azconfig.io"
      ),
    label: z.string().optional()
  })
});

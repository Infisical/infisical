import { z } from "zod";

import { PRODUCT_INSIGHTS } from "@app/lib/api-docs";

export const SecretsUsageInsightsSchema = z.object({
  activeLeases: z.number().int().describe(PRODUCT_INSIGHTS.GET_SECRETS_USAGE_INSIGHTS.activeLeases),
  users: z.number().int().describe(PRODUCT_INSIGHTS.GET_SECRETS_USAGE_INSIGHTS.users),
  identities: z.number().int().describe(PRODUCT_INSIGHTS.GET_SECRETS_USAGE_INSIGHTS.identities)
});

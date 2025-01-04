import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AzureAppConfigurationConfigurePage } from "./AzureAppConfigurationConfigurePage";

const AzureAppConfigurationPageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-app-configuration/create"
)({
  component: AzureAppConfigurationConfigurePage,
  validateSearch: zodValidator(AzureAppConfigurationPageQueryParamsSchema)
});

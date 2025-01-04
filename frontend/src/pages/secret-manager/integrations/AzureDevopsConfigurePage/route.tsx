import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AzureDevopsConfigurePage } from "./AzureDevopsConfigurePage";

const AzureDevopsConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-devops/create"
)({
  component: AzureDevopsConfigurePage,
  validateSearch: zodValidator(AzureDevopsConfigurePageQueryParamsSchema)
});

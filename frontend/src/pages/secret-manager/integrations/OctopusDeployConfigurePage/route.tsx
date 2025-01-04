import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OctopusDeployConfigurePage } from "./OctopusDeployConfigurePage";

const OctopusDeployConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/octopus-deploy/create"
)({
  component: OctopusDeployConfigurePage,
  validateSearch: zodValidator(OctopusDeployConfigurePageQueryParamsSchema)
});

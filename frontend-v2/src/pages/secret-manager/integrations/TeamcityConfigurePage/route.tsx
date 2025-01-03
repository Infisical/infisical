import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { TeamcityConfigurePage } from "./TeamcityConfigurePage";

const TeamcityConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/teamcity/create"
)({
  component: TeamcityConfigurePage,
  validateSearch: zodValidator(TeamcityConfigurePageQueryParamsSchema)
});

import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { RailwayConfigurePage } from "./RailwayConfigurePage";

const RailwayConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/railway/create"
)({
  component: RailwayConfigurePage,
  validateSearch: zodValidator(RailwayConfigurePageQueryParamsSchema)
});

import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { FlyioConfigurePage } from "./FlyioConfigurePage";

const FlyioConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/flyio/create"
)({
  component: FlyioConfigurePage,
  validateSearch: zodValidator(FlyioConfigurePageQueryParamsSchema)
});

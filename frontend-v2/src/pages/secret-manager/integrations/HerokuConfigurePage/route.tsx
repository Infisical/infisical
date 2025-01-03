import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { HerokuConfigurePage } from "./HerokuConfigurePage";

const HerokuConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/heroku/create"
)({
  component: HerokuConfigurePage,
  validateSearch: zodValidator(HerokuConfigurePageQueryParamsSchema)
});

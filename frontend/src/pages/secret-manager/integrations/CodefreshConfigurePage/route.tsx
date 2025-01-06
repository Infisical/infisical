import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CodefreshConfigurePage } from "./CodefreshConfigurePage";

const CodefreshConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/codefresh/create"
)({
  component: CodefreshConfigurePage,
  validateSearch: zodValidator(CodefreshConfigurePageQueryParamsSchema)
});

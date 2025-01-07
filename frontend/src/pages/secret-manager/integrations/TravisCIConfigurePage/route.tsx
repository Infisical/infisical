import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { TravisCIConfigurePage } from "./TravisCIConfigurePage";

const TravisCIConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/travisci/create"
)({
  component: TravisCIConfigurePage,
  validateSearch: zodValidator(TravisCIConfigurePageQueryParamsSchema)
});

import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { RundeckConfigurePage } from "./RundeckConfigurePage";

const RundeskConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/rundeck/create"
)({
  component: RundeckConfigurePage,
  validateSearch: zodValidator(RundeskConfigurePageQueryParamsSchema)
});

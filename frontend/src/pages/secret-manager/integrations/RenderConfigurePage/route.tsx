import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { RenderConfigurePage } from "./RenderConfigurePage";

const RenderConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/render/create"
)({
  component: RenderConfigurePage,
  validateSearch: zodValidator(RenderConfigurePageQueryParamsSchema)
});

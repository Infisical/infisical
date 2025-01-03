import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { NetlifyConfigurePage } from "./NetlifyConfigurePage";

const NetlifyConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/netlify/create"
)({
  component: NetlifyConfigurePage,
  validateSearch: zodValidator(NetlifyConfigurePageQueryParamsSchema)
});

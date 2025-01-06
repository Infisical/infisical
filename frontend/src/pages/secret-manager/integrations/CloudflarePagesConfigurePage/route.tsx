import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CloudflarePagesConfigurePage } from "./CloudflarePagesConfigurePage";

const CloudflarePagesConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloudflare-pages/create"
)({
  component: CloudflarePagesConfigurePage,
  validateSearch: zodValidator(CloudflarePagesConfigurePageQueryParamsSchema)
});

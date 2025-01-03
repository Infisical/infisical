import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CloudflareWorkersConfigurePage } from "./CloudflareWorkersConfigurePage";

const CloudflareWorkersConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloudflare-workers/create"
)({
  component: CloudflareWorkersConfigurePage,
  validateSearch: zodValidator(CloudflareWorkersConfigurePageQueryParamsSchema)
});

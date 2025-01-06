import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { DigitalOceanAppPlatformConfigurePage } from "./DigitalOceanAppPlatformConfigurePage";

const DigitalOceanAppPlatformConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/digital-ocean-app-platform/create"
)({
  component: DigitalOceanAppPlatformConfigurePage,
  validateSearch: zodValidator(DigitalOceanAppPlatformConfigurePageQueryParamsSchema)
});

import { createFileRoute } from "@tanstack/react-router";

import { DigitalOceanAppPlatformAuthorizePage } from "./DigitalOceanAppPlatformAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/digital-ocean-app-platform/authorize"
)({
  component: DigitalOceanAppPlatformAuthorizePage
});

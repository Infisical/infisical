import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { DigitalOceanAppPlatformAuthorizePage } from "./DigitalOceanAppPlatformAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/digital-ocean-app-platform/authorize"
)({
  component: DigitalOceanAppPlatformAuthorizePage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/secret-manager/$projectId/integrations",
            params
          })
        },
        {
          label: "DigitalOcean App Platform"
        }
      ]
    };
  }
});

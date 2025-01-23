import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { DigitalOceanAppPlatformConfigurePage } from "./DigitalOceanAppPlatformConfigurePage";

const DigitalOceanAppPlatformConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/digital-ocean-app-platform/create"
)({
  component: DigitalOceanAppPlatformConfigurePage,
  validateSearch: zodValidator(DigitalOceanAppPlatformConfigurePageQueryParamsSchema),
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

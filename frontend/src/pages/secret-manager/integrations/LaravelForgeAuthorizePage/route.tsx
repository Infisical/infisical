import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { LaravelForgeAuthorizePage } from "./LaravelForgeAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/laravel-forge/authorize"
)({
  component: LaravelForgeAuthorizePage,
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
          label: "Laravel Forge"
        }
      ]
    };
  }
});

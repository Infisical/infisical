import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CloudflareWorkersAuthorizePage } from "./CloudflareWorkersAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/cloudflare-workers/authorize"
)({
  component: CloudflareWorkersAuthorizePage,
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
          label: "Cloudflare Workers"
        }
      ]
    };
  }
});

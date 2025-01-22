import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CloudflarePagesAuthorizePage } from "./CloudflarePagesAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/cloudflare-pages/authorize"
)({
  component: CloudflarePagesAuthorizePage,
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
          label: "Cloudflare Pages"
        }
      ]
    };
  }
});

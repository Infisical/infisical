import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { GcpSecretManagerAuthorizePage } from "./GcpSecretManagerAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/authorize"
)({
  component: GcpSecretManagerAuthorizePage,
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
          label: "GCP Secret Manager"
        }
      ]
    };
  }
});

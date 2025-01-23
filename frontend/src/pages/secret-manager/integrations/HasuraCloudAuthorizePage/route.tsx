import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { HasuraCloudAuthorizePage } from "./HasuraCloudAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/hasura-cloud/authorize"
)({
  component: HasuraCloudAuthorizePage,
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
          label: "Hasura Cloud"
        }
      ]
    };
  }
});

import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SecretSyncDetailsByIDPage } from "./SecretSyncDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/secret-syncs/$destination/$syncId"
)({
  component: SecretSyncDetailsByIDPage,
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
          label: "Secret Sync"
        }
      ]
    };
  }
});

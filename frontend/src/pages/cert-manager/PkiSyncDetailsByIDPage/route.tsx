import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { PkiSyncDetailsByIDPage } from "./index";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-management/$projectId/_cert-manager-layout/integrations/$syncId"
)({
  component: PkiSyncDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-management/$projectId/integrations",
            params,
            search: {
              selectedTab: IntegrationsListPageTabs.PkiSyncs
            }
          })
        },
        {
          label: "PKI Sync"
        }
      ]
    };
  }
});

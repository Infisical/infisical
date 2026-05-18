import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { PkiSyncDetailsByIDPage } from "./index";

const PkiSyncDetailsSearchSchema = z.object({
  applicationName: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/integrations/$syncId"
)({
  component: PkiSyncDetailsByIDPage,
  validateSearch: zodValidator(PkiSyncDetailsSearchSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/integrations",
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

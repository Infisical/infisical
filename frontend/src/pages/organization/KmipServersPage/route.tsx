import { createFileRoute } from "@tanstack/react-router";

import { KmipServersPage } from "./KmipServersPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/kms/kmip-servers/"
)({
  component: KmipServersPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "KMIP Servers"
      }
    ]
  })
});

import { createFileRoute } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { KmipServersPage } from "./KmipServersPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/kms/kmip-servers/"
)({
  component: KmipServersPage,
  context: () => ({
    productType: ProjectType.KMS,
    breadcrumbs: [
      {
        label: "KMIP Servers"
      }
    ]
  })
});

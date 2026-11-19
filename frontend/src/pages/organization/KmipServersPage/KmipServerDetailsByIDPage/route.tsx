import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { KmipServerDetailsByIDPage } from "./KmipServerDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId"
)({
  component: KmipServerDetailsByIDPage,
  context: ({ params }) => ({
    productType: ProjectType.KMS,
    breadcrumbs: [
      {
        label: "KMIP Servers",
        link: linkOptions({
          to: "/organizations/$orgId/projects/kms/kmip-servers" as const,
          params
        })
      },
      {
        label: "KMIP Server"
      }
    ]
  })
});

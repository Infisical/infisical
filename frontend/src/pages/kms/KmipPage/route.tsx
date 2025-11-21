import { createFileRoute } from "@tanstack/react-router";

import { KmipPage } from "./KmipPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/kms/$projectId/_kms-layout/kmip"
)({
  component: KmipPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "KMIP"
        }
      ]
    };
  }
});

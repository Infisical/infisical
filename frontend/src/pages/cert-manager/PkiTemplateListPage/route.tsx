import { createFileRoute } from "@tanstack/react-router";

import { PkiTemplateListPage } from "./PkiTemplateListPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-templates/"
)({
  component: PkiTemplateListPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Templates"
        }
      ]
    };
  }
});

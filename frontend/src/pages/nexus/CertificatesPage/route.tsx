import { createFileRoute } from "@tanstack/react-router";

import { CertificatesPage } from "./CertificatesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nexus/$projectId/_nexus-layout/certificates"
)({
  component: CertificatesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificates"
        }
      ]
    };
  }
});

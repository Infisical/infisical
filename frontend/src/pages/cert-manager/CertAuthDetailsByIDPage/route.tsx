import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CertAuthDetailsByIDPage } from "./CertAuthDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/ca/$caId"
)({
  component: CertAuthDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Authorities",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/certificate-authorities",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            }
          })
        },
        {
          label: params.caId
        }
      ]
    };
  }
});

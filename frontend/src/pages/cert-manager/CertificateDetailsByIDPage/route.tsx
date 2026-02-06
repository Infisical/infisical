import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CertificateDetailsByIDPage } from "./CertificateDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificates/$certificateId"
)({
  component: CertificateDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificates",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/policies",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            }
          })
        },
        {
          label: params.certificateId
        }
      ]
    };
  }
});

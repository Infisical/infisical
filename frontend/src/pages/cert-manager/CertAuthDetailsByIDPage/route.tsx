import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CertAuthDetailsByIDPage } from "./CertAuthDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/ca/$caName"
)({
  component: CertAuthDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Authorities",
          link: linkOptions({
            to: "/cert-manager/$projectId/certificate-authorities",
            params: {
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});

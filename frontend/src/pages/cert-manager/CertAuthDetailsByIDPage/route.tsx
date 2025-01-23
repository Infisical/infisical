import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CertAuthDetailsByIDPage } from "./CertAuthDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/ca/$caId"
)({
  component: CertAuthDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Authorities",
          link: linkOptions({
            to: "/cert-manager/$projectId/overview",
            params: {
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});

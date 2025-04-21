import { createFileRoute } from "@tanstack/react-router";

import { CertificatesPage } from "./CertificatesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/certificate-authorities"
)({
  component: CertificatesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Authorities"
        }
      ]
    };
  }
});

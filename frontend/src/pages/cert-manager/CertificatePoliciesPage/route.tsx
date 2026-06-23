import { createFileRoute } from "@tanstack/react-router";

import { CertificatePoliciesPage } from "./CertificatePoliciesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-policies/"
)({
  component: CertificatePoliciesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Policies"
        }
      ]
    };
  }
});

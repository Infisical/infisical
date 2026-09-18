import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificateAuthoritiesPage, CertificateAuthorityTab } from "./CertificateAuthoritiesPage";

const CertificateAuthoritiesSearchSchema = z.object({
  selectedTab: z.nativeEnum(CertificateAuthorityTab).catch(CertificateAuthorityTab.Internal)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-authorities"
)({
  component: CertificateAuthoritiesPage,
  validateSearch: zodValidator(CertificateAuthoritiesSearchSchema),
  search: {
    middlewares: [stripSearchParams({ selectedTab: CertificateAuthorityTab.Internal })]
  },
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

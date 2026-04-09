import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamDomainByIDPage } from "./PamDomainByIDPage";

enum DomainDetailTab {
  Accounts = "accounts",
  RelatedResources = "related-resources"
}

const domainDetailSearchSchema = z.object({
  selectedTab: z.nativeEnum(DomainDetailTab).optional().default(DomainDetailTab.Accounts)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/domains/$domainType/$domainId/"
)({
  validateSearch: zodValidator(domainDetailSearchSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Domains",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/domains",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Domain Details"
        }
      ]
    };
  },
  component: PamDomainByIDPage
});

export { DomainDetailTab };

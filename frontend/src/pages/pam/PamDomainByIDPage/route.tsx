import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ResourceDetailTab } from "../PamResourceByIDPage/route";
import { PamDomainByIDPage } from "./PamDomainByIDPage";

const DomainDetailSearchSchema = z.object({
  selectedTab: z.nativeEnum(ResourceDetailTab).catch(ResourceDetailTab.Accounts)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/domains/$resourceType/$resourceId/"
)({
  validateSearch: zodValidator(DomainDetailSearchSchema),
  component: PamDomainByIDPage,
  search: {
    middlewares: [stripSearchParams({ selectedTab: ResourceDetailTab.Accounts })]
  },
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
  }
});

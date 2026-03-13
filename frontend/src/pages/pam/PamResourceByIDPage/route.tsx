import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamResourceByIDPage } from "./PamResourceByIDPage";

export enum ResourceDetailTab {
  Accounts = "accounts",
  RelatedResources = "related-resources"
}

const ResourceDetailSearchSchema = z.object({
  selectedTab: z.nativeEnum(ResourceDetailTab).catch(ResourceDetailTab.Accounts)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/resources/$resourceType/$resourceId/"
)({
  validateSearch: zodValidator(ResourceDetailSearchSchema),
  component: PamResourceByIDPage,
  search: {
    middlewares: [stripSearchParams({ selectedTab: ResourceDetailTab.Accounts })]
  },
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Resources",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/resources",
            params: { orgId: params.orgId, projectId: params.projectId }
          })
        },
        {
          label: "Resource Details"
        }
      ]
    };
  }
});

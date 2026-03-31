import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamAccountByIDPage } from "../PamAccountByIDPage/PamAccountByIDPage";
import { AccountDetailTab } from "../PamAccountByIDPage/route";

const AccountDetailSearchSchema = z.object({
  selectedTab: z.nativeEnum(AccountDetailTab).catch(AccountDetailTab.Resources)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/domains/$resourceType/$resourceId/accounts/$accountId/"
)({
  validateSearch: zodValidator(AccountDetailSearchSchema),
  component: PamAccountByIDPage,
  search: {
    middlewares: [stripSearchParams({ selectedTab: AccountDetailTab.Resources })]
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
          label: "Domain",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/domains/$resourceType/$resourceId",
            params: {
              orgId: params.orgId,
              projectId: params.projectId,
              resourceType: params.resourceType,
              resourceId: params.resourceId
            }
          })
        },
        {
          label: "Account Details"
        }
      ]
    };
  }
});

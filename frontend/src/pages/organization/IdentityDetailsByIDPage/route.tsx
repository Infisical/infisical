import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OrgAccessControlTabSections } from "@app/types/org";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/identities/$identityId"
)({
  component: IdentityDetailsByIDPage,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({
          to: "/organizations/$orgId/access-management" as const,
          params,
          search: { selectedTab: OrgAccessControlTabSections.Identities }
        })
      },
      {
        label: "Machine Identity"
      }
    ]
  })
});

import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";

import { OauthApplicationsPage } from "./OauthApplicationsPage";

// Tolerate a stray ?selectedTab carried over by old Settings/Integrations redirects, then strip it.
const OauthApplicationsPageQuerySchema = z.object({
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/oauth-applications"
)({
  component: OauthApplicationsPage,
  validateSearch: zodValidator(OauthApplicationsPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  beforeLoad: async ({ context, params }) => {
    const org = await context.queryClient.ensureQueryData({
      queryKey: organizationKeys.getOrgById(context.organizationId),
      queryFn: () => fetchOrganizationById(context.organizationId)
    });

    // OAuth applications are root-org only; sub-orgs must not reach this page via direct URL or moved-tab redirects.
    if (org.rootOrgId && org.id !== org.rootOrgId) {
      throw redirect({
        to: "/organizations/$orgId/settings",
        params: { orgId: params.orgId }
      });
    }

    return {
      breadcrumbs: [
        {
          label: "OAuth Applications"
        }
      ]
    };
  }
});

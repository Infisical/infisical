import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";

import { SsoPage } from "./SsoPage";

const SsoPageQuerySchema = z.object({
  selectedTab: z.string().catch("").default("sso")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/sso"
)({
  component: SsoPage,
  validateSearch: zodValidator(SsoPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  beforeLoad: async ({ context, params }) => {
    const org = await context.queryClient.ensureQueryData({
      queryKey: organizationKeys.getOrgById(context.organizationId),
      queryFn: () => fetchOrganizationById(context.organizationId)
    });

    // SSO/SCIM config is root-org only; sub-orgs must not reach it via direct URL or moved-tab redirects.
    if (org.rootOrgId && org.id !== org.rootOrgId) {
      throw redirect({
        to: "/organizations/$orgId/settings",
        params: { orgId: params.orgId }
      });
    }

    return {
      breadcrumbs: [
        {
          label: "SSO & Provisioning"
        }
      ]
    };
  }
});

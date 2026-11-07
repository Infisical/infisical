import { createFileRoute, lazyRouteComponent, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import {
  autoSelectOrganization,
  SelectOrganizationPageQueryParams
} from "@app/helpers/authRouteGuards";

import { SelectOrgPage } from "./SelectOrgPage";

export const Route = createFileRoute("/v4/_v4-auth/login/select-organization")({
  validateSearch: zodValidator(SelectOrganizationPageQueryParams),
  search: {
    middlewares: [
      stripSearchParams({
        org_id: "",
        callback_port: undefined,
        is_admin_login: false,
        mfa_method: undefined
      })
    ]
  },
  beforeLoad: async ({ context, search }) => {
    if (context.authPreview) return { autoSelectErrorMessage: undefined };
    const { withV4Redirects } = await import("../paths");
    return withV4Redirects(() => autoSelectOrganization({ context, search }));
  },
  component: SelectOrgPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});

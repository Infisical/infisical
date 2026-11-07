import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import {
  autoSelectOrganization,
  SelectOrganizationPageQueryParams
} from "@app/helpers/authRouteGuards";

import { SelectOrgPage } from "./SelectOrgPage";

export const Route = createFileRoute("/_restrict-login-signup/login/select-organization")({
  component: SelectOrgPage,
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
  beforeLoad: ({ context, search }) => autoSelectOrganization({ context, search })
});

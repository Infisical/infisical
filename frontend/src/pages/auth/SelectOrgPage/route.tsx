import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SelectOrganizationPage } from "./SelectOrgPage";

export const SelectOrganizationPageQueryParams = z.object({
  org_id: z.string().optional().catch(""),
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  force: z.boolean().optional(),
  mfa_pending: z.boolean().optional().catch(false)
});

export const Route = createFileRoute("/_restrict-login-signup/login/select-organization")({
  component: SelectOrganizationPage,
  validateSearch: zodValidator(SelectOrganizationPageQueryParams),
  search: {
    middlewares: [
      stripSearchParams({
        org_id: "",
        callback_port: undefined,
        is_admin_login: false,
        mfa_pending: false
      })
    ]
  }
});

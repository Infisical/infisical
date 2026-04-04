import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { selectOrganization } from "@app/hooks/api/auth/queries";
import {
  fetchOrganizationsWithSubOrgs,
  organizationKeys
} from "@app/hooks/api/organization/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";

import { SelectOrgPage } from "./SelectOrgPage";

export const SelectOrganizationPageQueryParams = z.object({
  org_id: z.string().optional().catch(""),
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  force: z.boolean().optional(),
  mfa_pending: z.boolean().optional().catch(false),
  mfaToken: z.string().optional().catch(undefined),
  mfaMethod: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/_restrict-login-signup/login/select-organization")({
  component: SelectOrgPage,
  validateSearch: zodValidator(SelectOrganizationPageQueryParams),
  search: {
    middlewares: [
      stripSearchParams({
        org_id: "",
        callback_port: undefined,
        is_admin_login: false,
        mfa_pending: false,
        mfaToken: undefined,
        mfaMethod: undefined
      })
    ]
  },
  beforeLoad: async ({ context, search }) => {
    // Skip auto-select for CLI flows, MFA pending, or force flag
    if (search.callback_port || search.mfa_pending || search.mfaToken || search.force) return;

    try {
      const orgsWithSubOrgs = await context.queryClient.ensureQueryData({
        queryKey: organizationKeys.getUserOrganizationsWithSubOrgs,
        queryFn: fetchOrganizationsWithSubOrgs
      });

      if (orgsWithSubOrgs.length === 0) {
        throw redirect({ to: "/organizations/none" });
      }

      // Auto-select only when exactly 1 root org with no sub-orgs
      const hasSingleOrgWithNoSubOrgs =
        orgsWithSubOrgs.length === 1 && orgsWithSubOrgs[0].subOrganizations.length === 0;

      if (hasSingleOrgWithNoSubOrgs) {
        const orgId = orgsWithSubOrgs[0].id;

        // If org_id is specified and doesn't match the only org, let the page handle it
        if (search.org_id && search.org_id !== orgId) return;

        const result = await selectOrganization({ organizationId: orgId });

        if (result.isMfaEnabled) {
          // MFA required — redirect back to this page with MFA params so the component renders MFA immediately
          throw redirect({
            to: "/login/select-organization",
            search: {
              mfaToken: result.token,
              mfaMethod: result.mfaMethod,
              org_id: orgId
            }
          });
        }

        setAuthToken(result.token);
        throw redirect({
          to: "/organizations/$orgId/projects",
          params: { orgId }
        });
      }
    } catch (error) {
      console.error(error);
      // If it's a redirect, re-throw it
      if (error instanceof Error && error.message === "REDIRECT") throw error;
      // For redirect objects from TanStack Router
      if (typeof error === "object" && error !== null && "to" in error) throw error;
      // Otherwise let the page render and handle errors
    }
  }
});

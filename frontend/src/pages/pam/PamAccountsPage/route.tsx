import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamAccountView } from "@app/hooks/api/pam";

import { PamAccountsPage } from "./PamAccountsPage";

const PamAccountsPageQueryParamsSchema = z.object({
  search: z.string().optional(),
  accountView: z.nativeEnum(PamAccountView).optional(),
  accountPath: z.string().catch("/")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/accounts/"
)({
  validateSearch: zodValidator(PamAccountsPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ accountPath: "/" })]
  },
  beforeLoad: ({ context, params, search }) => {
    const accountPathSegments = search.accountPath.split("/").filter(Boolean);
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Accounts",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/accounts",
            params: () => params as never,
            search: (prev) => ({ ...prev, accountPath: "/" })
          })
        },
        ...accountPathSegments.map((segment, index) => {
          const newPath = `/${accountPathSegments.slice(0, index + 1).join("/")}/`;
          return {
            label: segment,
            link: linkOptions({
              to: "/organizations/$orgId/projects/pam/$projectId/accounts",
              params: () => params as never,
              search: (prev) => ({ ...prev, accountPath: newPath })
            })
          };
        })
      ]
    };
  },
  component: PamAccountsPage
});

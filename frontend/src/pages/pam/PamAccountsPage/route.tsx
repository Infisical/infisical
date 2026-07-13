import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamAccountsPage } from "./PamAccountsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/accounts"
)({
  validateSearch: zodValidator(pamSheetSearchParams),
  search: {
    middlewares: [stripSearchParams({ accountId: undefined, folderId: undefined })]
  },
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Accounts" }]
  }),
  component: PamAccountsPage
});

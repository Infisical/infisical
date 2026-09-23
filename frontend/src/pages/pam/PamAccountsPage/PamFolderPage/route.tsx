import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamFolderPage } from "./PamFolderPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/accounts/$folderId"
)({
  validateSearch: zodValidator(pamSheetSearchParams),
  search: {
    middlewares: [stripSearchParams({ accountId: undefined })]
  },
  beforeLoad: ({ context, params }) => ({
    breadcrumbs: [
      ...context.breadcrumbs,
      {
        label: "Accounts",
        link: linkOptions({
          to: "/organizations/$orgId/pam/accounts",
          params: { orgId: params.orgId }
        })
      },
      { label: "Folder" }
    ]
  }),
  component: PamFolderPage
});

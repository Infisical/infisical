import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamTemplatesPage } from "./PamTemplatesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/templates"
)({
  validateSearch: zodValidator(pamSheetSearchParams),
  search: {
    middlewares: [stripSearchParams({ templateId: undefined })]
  },
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Account Templates" }]
  }),
  component: PamTemplatesPage
});

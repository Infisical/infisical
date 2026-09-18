import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { pamSheetSearchParams } from "@app/hooks/usePamSheetState";

import { PamSessionsPage } from "./PamSessionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/sessions"
)({
  component: PamSessionsPage,
  validateSearch: zodValidator(pamSheetSearchParams),
  search: {
    middlewares: [stripSearchParams({ sessionId: undefined })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Sessions"
        }
      ]
    };
  }
});

import { createFileRoute } from "@tanstack/react-router";

import { CodeSigningPage } from "./CodeSigningPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/code-signing/"
)({
  component: CodeSigningPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Code Signing"
        }
      ]
    };
  }
});

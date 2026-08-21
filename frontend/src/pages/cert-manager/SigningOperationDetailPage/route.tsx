import { createFileRoute } from "@tanstack/react-router";

import { SigningOperationDetailPage } from "./SigningOperationDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/$signerId/operations/$operationId"
)({
  component: SigningOperationDetailPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Code Signing"
        },
        {
          label: "Signing Operation"
        }
      ]
    };
  }
});

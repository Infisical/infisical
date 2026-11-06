import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SigningOperationDetailPage } from "./SigningOperationDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/code-signing/$signerId/operations/$operationId"
)({
  component: SigningOperationDetailPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Code Signing",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/code-signing",
            params: { orgId: params.orgId }
          })
        },
        {
          label: "Signing Operation"
        }
      ]
    };
  }
});

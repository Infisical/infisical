import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SigningOperationDetailPage } from "./SigningOperationDetailPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/code-signing/$signerId/operations/$operationId"
)({
  staticData: { readiness: "full" },
  component: SigningOperationDetailPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

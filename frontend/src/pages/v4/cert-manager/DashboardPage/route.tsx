import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "./DashboardPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/overview")({
  component: DashboardPage
});

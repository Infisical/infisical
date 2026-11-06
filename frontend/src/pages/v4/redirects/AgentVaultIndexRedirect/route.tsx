import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { AgentVaultIndexRedirect } from "./AgentVaultIndexRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/agent-vault/$projectId/")({
  component: AgentVaultIndexRedirect,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});

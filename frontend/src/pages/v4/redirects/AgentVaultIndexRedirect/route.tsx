import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { AgentVaultIndexRedirect } from "./AgentVaultIndexRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/agent-vault/$projectId/")({
  staticData: { readiness: "partial", missing: ["Setup checklist"] },
  component: AgentVaultIndexRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

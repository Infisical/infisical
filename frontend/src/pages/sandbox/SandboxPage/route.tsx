import { createFileRoute } from "@tanstack/react-router";

import { SandboxPage } from "./SandboxPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/sandboxes/_sandbox-layout/$sandboxId"
)({
  component: SandboxPage
});

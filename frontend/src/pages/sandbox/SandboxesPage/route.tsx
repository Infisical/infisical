import { createFileRoute } from "@tanstack/react-router";

import { SandboxesPage } from "./SandboxesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/sandboxes/_sandbox-layout/"
)({
  component: SandboxesPage
});

import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultSheetSearchParams } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultSessionsPage } from "./AgentVaultSessionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/sessions"
)({
  component: AgentVaultSessionsPage,
  // The open sheet lives in the URL, so a timeline is a link and the back button closes it.
  validateSearch: zodValidator(agentVaultSheetSearchParams),
  search: { middlewares: [stripSearchParams({ sessionId: undefined, tab: undefined })] },
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Sessions" }] };
  }
});

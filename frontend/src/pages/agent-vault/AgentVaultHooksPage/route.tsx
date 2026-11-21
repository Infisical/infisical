import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultHookSheetSearchParams } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultHooksPage } from "./AgentVaultHooksPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/hooks"
)({
  component: AgentVaultHooksPage,
  validateSearch: zodValidator(agentVaultHookSheetSearchParams),
  search: {
    middlewares: [stripSearchParams({ hookId: undefined })]
  },
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Hooks" }] };
  }
});

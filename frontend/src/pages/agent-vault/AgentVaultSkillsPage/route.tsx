import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultSkillSheetSearchParams } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultSkillsPage } from "./AgentVaultSkillsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/skills"
)({
  component: AgentVaultSkillsPage,
  validateSearch: zodValidator(agentVaultSkillSheetSearchParams),
  search: {
    middlewares: [stripSearchParams({ skillId: undefined })]
  },
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Skills" }] };
  }
});

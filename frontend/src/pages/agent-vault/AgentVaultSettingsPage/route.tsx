import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AgentVaultSettingsPage } from "./AgentVaultSettingsPage";

const AgentVaultSettingsPageQueryParams = z.object({
  selectedTab: z.string().catch("tab-project-general")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/settings"
)({
  component: AgentVaultSettingsPage,
  validateSearch: zodValidator(AgentVaultSettingsPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Settings" }] };
  }
});

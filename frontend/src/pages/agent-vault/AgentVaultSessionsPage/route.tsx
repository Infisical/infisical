import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AgentVaultSessionsPage } from "./AgentVaultSessionsPage";

const searchSchema = z.object({
  accessBundleId: z.string().optional().catch(undefined)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/sessions"
)({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ accessBundleId: undefined })]
  },
  component: AgentVaultSessionsPage,
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Sessions" }] };
  }
});

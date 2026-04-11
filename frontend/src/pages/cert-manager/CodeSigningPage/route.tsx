import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CodeSigningPage } from "./CodeSigningPage";

const CodeSigningSearchSchema = z.object({
  selectedTab: z.string().optional().default("signers"),
  tab: z.enum(["signers", "approvals"]).optional(),
  subtab: z.enum(["requests", "policies", "grants"]).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/"
)({
  component: CodeSigningPage,
  validateSearch: zodValidator(CodeSigningSearchSchema),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Code Signing"
        }
      ]
    };
  }
});

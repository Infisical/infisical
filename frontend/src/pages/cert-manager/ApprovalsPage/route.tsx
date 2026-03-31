import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApprovalsPage } from "./ApprovalsPage";

const ApprovalsSearchSchema = z.object({
  selectedTab: z.string().optional().default("requests"),
  section: z.enum(["certificates", "code-signing"]).optional().default("certificates")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approvals"
)({
  component: ApprovalsPage,
  validateSearch: zodValidator(ApprovalsSearchSchema),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Approvals"
        }
      ]
    };
  }
});

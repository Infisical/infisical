import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApprovalControlTabs } from "@app/types/project";

import { ApprovalsPage } from "./ApprovalsPage";

const ApprovalPagePageQuerySchema = z.object({
  selectedTab: z.nativeEnum(ApprovalControlTabs).catch(ApprovalControlTabs.Requests)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layou t/approvals"
)({
  component: ApprovalsPage,
  validateSearch: zodValidator(ApprovalPagePageQuerySchema),
  search: {
    middlewares: [stripSearchParams({})]
  },
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

import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PoliciesPage } from "./PoliciesPage";

const policiesPageSearchSchema = z.object({
  selectedTab: z.string().optional().default("certificates")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/policies"
)({
  component: PoliciesPage,
  validateSearch: zodValidator(policiesPageSearchSchema),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Policies"
        }
      ]
    };
  }
});

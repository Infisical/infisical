import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamRotationsPage } from "./PamRotationsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/rotations/"
)({
  validateSearch: zodValidator(
    z.object({
      search: z.string().optional()
    })
  ),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Rotation Policies"
        }
      ]
    };
  },
  component: PamRotationsPage
});

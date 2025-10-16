import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamSessionPage } from "./PamSessionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/pam/$projectId/_pam-layout/sessions/"
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
          label: "Sessions"
        }
      ]
    };
  },
  component: PamSessionPage
});

import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { BlastRadiusPage } from "./BlastRadiusPage";

// Every parameter lives in the URL so the view is shareable: during an incident the useful artifact is
// a link someone else can open on exactly this secret.
const BlastRadiusPageQueryParamsSchema = z.object({
  secretKey: z.string().catch(""),
  environment: z.string().catch(""),
  secretPath: z.string().catch("/")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/blast-radius"
)({
  component: BlastRadiusPage,
  validateSearch: zodValidator(BlastRadiusPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ secretPath: "/" })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Blast Radius"
        }
      ]
    };
  }
});

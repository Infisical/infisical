import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OverviewPage } from "./OverviewPage";

const SecretOverviewPageQuerySchema = z.object({
  search: z.string().catch(""),
  secretPath: z.string().catch("/")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/overview"
)({
  component: OverviewPage,
  validateSearch: zodValidator(SecretOverviewPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ secretPath: "/", search: "" })]
  },
  beforeLoad: ({ context, params }) => ({
    ...context,
    breadcrumbs: [
      ...context.breadcrumbs,
      {
        label: "Secrets",
        link: linkOptions({
          to: "/projects/$projectId/secret-manager/overview",
          params
        })
      }
    ]
  })
});

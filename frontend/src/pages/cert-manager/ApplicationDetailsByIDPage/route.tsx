import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApplicationDetailsByIDPage } from "./ApplicationDetailsByIDPage";

const ApplicationTabSchema = z.enum([
  "overview",
  "certificates",
  "requests",
  "syncs",
  "members",
  "settings"
]);

const SearchSchema = z.object({
  selectedTab: ApplicationTabSchema.optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/applications/$applicationName"
)({
  component: ApplicationDetailsByIDPage,
  validateSearch: zodValidator(SearchSchema),
  search: { middlewares: [stripSearchParams({ selectedTab: "overview" })] },
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Applications" }, { label: "Application" }]
  })
});

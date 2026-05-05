import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertManagerAccessPage } from "./CertManagerAccessPage";

const SearchSchema = z.object({
  selectedTab: z.enum(["users", "groups", "identities"]).optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/cert-manager-access"
)({
  component: CertManagerAccessPage,
  validateSearch: zodValidator(SearchSchema),
  search: { middlewares: [stripSearchParams({ selectedTab: "users" })] },
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Admins" }]
  })
});

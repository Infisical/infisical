import { createFileRoute, redirect } from "@tanstack/react-router";

import { hasProjectTemplates, urlSlugToProjectType } from "@app/helpers/project";

import { ProductSettingsPage } from "./ProductSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/product-settings/$type/"
)({
  component: ProductSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Product Settings"
      }
    ]
  }),
  beforeLoad: ({ params }) => {
    const projectType = urlSlugToProjectType(params.type);
    if (!projectType || !hasProjectTemplates(projectType)) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: params.orgId }
      });
    }
  }
});

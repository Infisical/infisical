import { createFileRoute } from "@tanstack/react-router";

import { ProductSettingsPage } from "./ProductSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/product-settings/"
)({
  component: ProductSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Product Settings"
      }
    ]
  })
});

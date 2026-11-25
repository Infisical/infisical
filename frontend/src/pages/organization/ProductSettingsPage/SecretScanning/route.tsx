import { createFileRoute } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { ProductSettingsPage } from "./ProductSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/product-settings"
)({
  component: ProductSettingsPage,
  context: () => ({
    productType: ProjectType.SecretScanning,
    breadcrumbs: [
      {
        label: "Product Settings"
      }
    ]
  })
});

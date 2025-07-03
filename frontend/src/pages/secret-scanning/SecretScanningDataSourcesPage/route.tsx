import { createFileRoute } from "@tanstack/react-router";

import { SecretScanningDataSourcesPage } from "./SecretScanningDataSourcesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-scanning/_secret-scanning-layout/data-sources/"
)({
  component: SecretScanningDataSourcesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Data Sources"
        }
      ]
    };
  }
});

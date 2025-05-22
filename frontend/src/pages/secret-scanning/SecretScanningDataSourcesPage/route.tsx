import { createFileRoute } from "@tanstack/react-router";

import { SecretScanningDataSourcesPage } from "./SecretScanningDataSourcesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-scanning/$projectId/_secret-scanning-layout/data-sources/"
)({
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Data Sources",

        }
      ]
    };
  },
  component: SecretScanningDataSourcesPage
});

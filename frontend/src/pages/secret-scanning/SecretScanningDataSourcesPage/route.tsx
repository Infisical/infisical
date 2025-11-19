import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningDataSourcesPage } from "./SecretScanningDataSourcesPage";

const SecretScanningDataSourcesPageQueryParamsSchema = z.object({
  connectionId: z.string().optional(),
  connectionName: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/_secret-scanning-layout/data-sources/"
)({
  component: SecretScanningDataSourcesPage,
  validateSearch: zodValidator(SecretScanningDataSourcesPageQueryParamsSchema),
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

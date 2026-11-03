import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { DataSourceTab } from "./data-source-tabs";
import { SecretScanningDataSourceByIdPage } from "./SecretScanningDataSourceByIdPage";

const SearchSchema = z.object({
  selectedTab: z.nativeEnum(DataSourceTab).catch(DataSourceTab.Findings).optional(),
  resourceId: z.string().uuid().optional().catch(undefined)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-scanning/_secret-scanning-layout/data-sources/$type/$dataSourceId"
)({
  component: SecretScanningDataSourceByIdPage,
  validateSearch: zodValidator(SearchSchema),
  search: { middlewares: [stripSearchParams({ selectedTab: DataSourceTab.Findings })] },
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        // When the first load rewrites the search (a malformed resourceId or selectedTab, or the
        // stripped default tab), the router reruns this before the layout's context has arrived
        ...(context.breadcrumbs ?? []),
        {
          label: "Data Sources",
          link: linkOptions({
            to: "/organizations/$orgId/secret-scanning/data-sources",
            params
          })
        },
        {
          label: "Details"
        }
      ]
    };
  }
});

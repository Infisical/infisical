import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningDataSourcesPage } from "./SecretScanningDataSourcesPage";

const SecretScanningDataSourcesPageQueryParamsSchema = z.object({
  connectionId: z.string().optional(),
  connectionName: z.string().optional()
});

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/data-sources/")({
  staticData: { readiness: "full" },
  component: SecretScanningDataSourcesPage,
  validateSearch: zodValidator(SecretScanningDataSourcesPageQueryParamsSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

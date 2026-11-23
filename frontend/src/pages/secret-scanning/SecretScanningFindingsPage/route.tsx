import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningFindingStatus } from "@app/hooks/api/secretScanningV2";

import { SecretScanningFindingsPage } from "./SecretScanningFindingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-scanning/_secret-scanning-layout/findings"
)({
  validateSearch: zodValidator(
    z
      .object({
        dataSourceId: z.string().uuid().optional().catch(undefined),
        resourceId: z.string().uuid().optional().catch(undefined),
        scanId: z.string().uuid().optional().catch(undefined),
        status: z
          .union([z.nativeEnum(SecretScanningFindingStatus), z.literal("all")])
          .optional()
          .catch(undefined),
        // leak emails and notifications sent before scanId was its own param link with ?search=scanId:<id>
        search: z
          .string()
          .startsWith("scanId:")
          .transform((value) => value.slice("scanId:".length))
          .pipe(z.string().uuid())
          .optional()
          .catch(undefined)
      })
      .transform(({ search: legacyScanId, ...rest }) => ({
        ...rest,
        scanId: rest.scanId ?? legacyScanId
      }))
  ),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Findings"
        }
      ]
    };
  },
  component: SecretScanningFindingsPage
});

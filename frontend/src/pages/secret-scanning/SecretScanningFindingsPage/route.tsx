import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretScanningFindingStatus } from "@app/hooks/api/secretScanningV2";

import { SecretScanningFindingsPage } from "./SecretScanningFindingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/_secret-scanning-layout/findings"
)({
  validateSearch: zodValidator(
    z.object({
      search: z.string().optional(),
      status: z.nativeEnum(SecretScanningFindingStatus).optional().catch(undefined)
    })
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

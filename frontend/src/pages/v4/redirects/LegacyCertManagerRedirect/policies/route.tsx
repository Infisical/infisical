import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LegacyPoliciesRedirect } from "../LegacyCertManagerRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/policies")({
  staticData: { readiness: "full" },
  component: LegacyPoliciesRedirect,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.string().optional(),
      filterStatus: z.string().optional(),
      filterEnrollmentType: z.string().optional(),
      filterKeyAlgorithm: z.string().optional(),
      filterCaId: z.string().optional(),
      filterExpiresDays: z.string().optional(),
      filterExpiresAfterDays: z.string().optional(),
      viewId: z.string().optional()
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});

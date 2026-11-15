import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificatePolicyDetailsByIDPage } from "./CertificatePolicyDetailsByIDPage";

const CertificatePolicyDetailsByIDPageQuerySchema = z.object({
  from: z.enum(["settings", "profile"]).optional(),
  profileId: z.string().optional(),
  profileFrom: z.enum(["settings", "application"]).optional(),
  profileApplicationName: z.string().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/certificate-policies/$policyId"
)({
  staticData: { readiness: "full" },
  component: CertificatePolicyDetailsByIDPage,
  validateSearch: zodValidator(CertificatePolicyDetailsByIDPageQuerySchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

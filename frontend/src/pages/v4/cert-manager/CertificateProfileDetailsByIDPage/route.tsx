import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificateProfileDetailsByIDPage } from "./CertificateProfileDetailsByIDPage";

const CertificateProfileDetailsByIDPageQuerySchema = z.object({
  from: z.enum(["settings", "application"]).optional(),
  applicationName: z.string().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/certificate-profiles/$profileId"
)({
  staticData: { readiness: "full" },
  component: CertificateProfileDetailsByIDPage,
  validateSearch: zodValidator(CertificateProfileDetailsByIDPageQuerySchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

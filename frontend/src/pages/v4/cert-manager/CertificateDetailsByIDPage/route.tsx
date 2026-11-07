import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificateDetailsByIDPage } from "./CertificateDetailsByIDPage";

const CertificateDetailsByIDPageQuerySchema = z.object({
  fromApplication: z.string().optional(),
  fromHsmConnector: z.string().uuid().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/certificates/$certificateId"
)({
  staticData: { readiness: "partial", missing: ["Renew now", "Auto renewal", "Certificate syncs"] },
  component: CertificateDetailsByIDPage,
  validateSearch: zodValidator(CertificateDetailsByIDPageQuerySchema),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificateAuthoritiesPage } from "./CertificateAuthoritiesPage";

const SearchSchema = z.object({
  selectedTab: z.string().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/certificate-authorities"
)({
  staticData: { readiness: "full" },
  component: CertificateAuthoritiesPage,
  validateSearch: zodValidator(SearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

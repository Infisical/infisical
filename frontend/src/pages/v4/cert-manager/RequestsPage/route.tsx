import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { RequestsPage } from "./RequestsPage";

const SearchSchema = z.object({
  selectedTab: z
    .enum(["application-requests", "signing-requests", "certificate-requests"])
    .optional()
});

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/requests")({
  staticData: {
    readiness: "partial",
    missing: ["Request a certificate"],
    classicHref: (href) =>
      href.includes("selectedTab=certificate-requests")
        ? href.replace("/cert-manager/requests", "/cert-manager/policies")
        : href
  },
  component: RequestsPage,
  validateSearch: zodValidator(SearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApprovalsPage } from "./ApprovalsPage";

const SearchSchema = z.object({
  selectedTab: z.string().optional().default("requests"),
  section: z.enum(["certificates", "code-signing"]).optional().default("certificates"),
  legacy: z.enum(["true"]).optional()
});

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/approvals/")({
  staticData: {
    readiness: "partial",
    missing: ["Create a certificate profile from the policy form"]
  },
  component: ApprovalsPage,
  validateSearch: zodValidator(SearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

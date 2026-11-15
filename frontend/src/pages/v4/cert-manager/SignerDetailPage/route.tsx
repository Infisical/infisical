import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SignerDetailPage } from "./SignerDetailPage";

const SearchSchema = z.object({
  selectedTab: z.enum(["activity", "approvals", "members"]).catch("activity").optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/code-signing/$signerId/"
)({
  staticData: { readiness: "full" },
  component: SignerDetailPage,
  validateSearch: zodValidator(SearchSchema),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

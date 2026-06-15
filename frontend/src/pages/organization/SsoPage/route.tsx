import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SsoPage } from "./SsoPage";

const SsoPageQuerySchema = z.object({
  selectedTab: z.string().catch("sso")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/sso"
)({
  component: SsoPage,
  validateSearch: zodValidator(SsoPageQuerySchema),
  context: () => ({
    breadcrumbs: [
      {
        label: "SSO & Provisioning"
      }
    ]
  })
});

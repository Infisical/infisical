import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OrgAccessControlTabSections } from "@app/types/org";

import { AccessManagementPage } from "./AccessManagementPage";

const AccessControlPageQuerySchema = z.object({
  selectedTab: z.string().catch(OrgAccessControlTabSections.Member),
  action: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/access-management"
)({
  component: AccessManagementPage,
  validateSearch: zodValidator(AccessControlPageQuerySchema),
  search: {
    // strip default values
    middlewares: [stripSearchParams({ action: "" })]
  }
});

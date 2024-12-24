import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OrgAccessControlTabSections } from "@app/types/org";

import { AccessControlPage } from "./AccessControlPage";

const AccessControlPageQuerySchema = z.object({
  selectedTab: z.string().catch(OrgAccessControlTabSections.Member),
  action: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/members/"
)({
  component: AccessControlPage,
  validateSearch: zodValidator(AccessControlPageQuerySchema)
});

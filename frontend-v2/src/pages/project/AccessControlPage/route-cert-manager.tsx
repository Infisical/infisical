import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectAccessControlTabs } from "@app/types/project";

import { AccessControlPage } from "./AccessControlPage";

const AccessControlPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(ProjectAccessControlTabs).catch(ProjectAccessControlTabs.Member)
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/access/"
)({
  component: AccessControlPage,
  validateSearch: zodValidator(AccessControlPageQuerySchema)
});

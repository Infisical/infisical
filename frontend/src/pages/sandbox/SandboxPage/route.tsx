import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SandboxPage, SandboxTab } from "./SandboxPage";

const SandboxPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(SandboxTab).catch(SandboxTab.Overview)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/sandboxes/_sandbox-layout/$sandboxId"
)({
  component: SandboxPage,
  validateSearch: zodValidator(SandboxPageQuerySchema)
});

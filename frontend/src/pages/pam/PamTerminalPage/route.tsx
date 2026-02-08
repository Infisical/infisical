import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamTerminalPage } from "./PamTerminalPage";

const searchSchema = z.object({
  accountId: z.string(),
  accountPath: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/terminal"
)({
  validateSearch: zodValidator(searchSchema),
  component: () => {
    const { accountId, accountPath } = Route.useSearch();
    return <PamTerminalPage accountId={accountId} accountPath={accountPath} />;
  }
});

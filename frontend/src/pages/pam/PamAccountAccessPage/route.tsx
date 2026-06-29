import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PamAccountAccessPage } from "./PamAccountAccessPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organizations/$orgId/pam/accounts/$accountType/$accountId/access"
)({
  component: PamAccountAccessPage,
  validateSearch: zodValidator(
    z.object({
      // Target host chosen at launch, for account types that allow multiple hosts
      host: z.string().optional()
    })
  )
});

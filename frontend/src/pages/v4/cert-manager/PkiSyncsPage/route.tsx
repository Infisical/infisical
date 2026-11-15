import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/integrations/")({
  staticData: { readiness: "full" },
  validateSearch: zodValidator(
    z.object({
      addSync: z.nativeEnum(PkiSync).optional(),
      connectionId: z.string().optional(),
      connectionName: z.string().optional()
    })
  ),
  component: lazyRouteComponent(() => import("./PkiSyncsPage"), "PkiSyncsPage"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});

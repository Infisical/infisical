import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { KeyVersionsPage } from "./KeyVersionsPage";
import { KEY_VERSIONS_ROUTE_ID } from "./routeId";

export const Route = createFileRoute(KEY_VERSIONS_ROUTE_ID)({
  component: KeyVersionsPage,
  validateSearch: z.object({
    keyName: z.string().optional(),
    algorithm: z.string().optional()
  }),
  beforeLoad: ({ context }) => ({
    breadcrumbs: [...context.breadcrumbs, { label: "Key Versions" }]
  })
});

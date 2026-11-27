import { createFileRoute } from "@tanstack/react-router";

import { authenticateSession } from "@app/helpers/routeGuards";

export const Route = createFileRoute("/_authenticate")({
  beforeLoad: authenticateSession
});

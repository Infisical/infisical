import { createFileRoute } from "@tanstack/react-router";

import { injectOrgDetails } from "@app/helpers/routeGuards";

// Route context to fill in organization's data like details, subscription etc
export const Route = createFileRoute("/_authenticate/_inject-org-details")({
  beforeLoad: (options) => injectOrgDetails(options)
});

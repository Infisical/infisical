import { index, route } from "@tanstack/virtual-file-routes";

export const v4Routes = route("/v4", "v4/route.tsx", [
  route("/organizations/$orgId", "v4/organization/route.tsx", [
    route("/projects", [
      index("v4/organization/ProjectsPage/route.tsx"),
      route("/kms/$projectId/overview", "v4/kms/OverviewPage/route.tsx"),
      route("/$", "v4/organization/NotPortedPage/projects/route.tsx")
    ]),
    route("/integrations", "v4/organization/IntegrationsPage/route.tsx"),
    route("/secret-scanning/findings", "v4/secret-scanning/SecretScanningFindingsPage/route.tsx"),
    route("/$", "v4/organization/NotPortedPage/route.tsx")
  ])
]);

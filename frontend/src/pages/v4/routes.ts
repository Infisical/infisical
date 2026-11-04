import { index, route } from "@tanstack/virtual-file-routes";

export const v4Routes = route("/v4", "v4/route.tsx", [
  route("/organizations/$orgId", "v4/organization/route.tsx", [
    route("/projects", [
      index("v4/organization/ProjectsPage/route.tsx"),
      route("/kms/$projectId/overview", "v4/kms/OverviewPage/route.tsx"),
      route("/secret-management/$projectId/overview", "v4/secret-manager/OverviewPage/route.tsx"),
      route(
        "/secret-management/$projectId/secrets/$envSlug",
        "v4/secret-manager/SecretDashboardPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/approval",
        "v4/secret-manager/SecretApprovalsPage/route.tsx"
      ),
      route("/$", "v4/organization/NotPortedPage/projects/route.tsx")
    ]),
    route("/$", "v4/organization/NotPortedPage/route.tsx")
  ])
]);

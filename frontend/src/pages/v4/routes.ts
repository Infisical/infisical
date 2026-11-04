import { index, route } from "@tanstack/virtual-file-routes";

export const v4Routes = route("/v4", "v4/route.tsx", [
  route("/organizations/$orgId", "v4/organization/route.tsx", [
    route("/projects", [
      index("v4/organization/ProjectsPage/route.tsx"),
      route("/kms/$projectId/overview", "v4/kms/OverviewPage/route.tsx"),
      route(
        "/secret-management/$projectId/access-management",
        "v4/project/AccessControlPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/members/$membershipId",
        "v4/project/MemberDetailsByIDPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/identities/$identityId",
        "v4/project/IdentityDetailsByIDPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/groups/$groupId",
        "v4/project/GroupDetailsByIDPage/route.tsx"
      ),
      route(
        "/secret-management/$projectId/roles/$roleSlug",
        "v4/project/RoleDetailsBySlugPage/route.tsx"
      ),
      route("/$", "v4/organization/NotPortedPage/projects/route.tsx")
    ]),
    route("/access-management", "v4/organization/AccessManagementPage/route.tsx"),
    route("/members/$membershipId", "v4/organization/UserDetailsByIDPage/route.tsx"),
    route("/identities/$identityId", "v4/organization/IdentityDetailsByIDPage/route.tsx"),
    route("/groups/$groupId", "v4/organization/GroupDetailsByIDPage/route.tsx"),
    route("/roles/$roleId", "v4/organization/RoleByIDPage/route.tsx"),
    route("/$", "v4/organization/NotPortedPage/route.tsx")
  ])
]);

import { route } from "@tanstack/virtual-file-routes";

export const v4Routes = route("/v4", "v4/route.tsx", [
  route("/organizations/$orgId", "v4/organization/route.tsx", [
    route("/projects", "v4/organization/ProjectsPage/route.tsx")
  ])
]);

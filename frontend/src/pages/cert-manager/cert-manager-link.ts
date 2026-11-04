import { getInstancePinningLink } from "@app/helpers/project";
import { Project } from "@app/hooks/api/projects/types";

export const getCertManagerLink = (
  project: Pick<Project, "id" | "type" | "orgId">,
  path: string,
  search?: Record<string, string>
) => {
  const pinnedLink = getInstancePinningLink(project.orgId, project, path);
  if (!pinnedLink) throw new Error("The link needs a Certificate Manager project");
  return { ...pinnedLink, search: search as any };
};

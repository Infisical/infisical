import { getInstancePinningLink } from "@app/helpers/project";
import { Project } from "@app/hooks/api/projects/types";

export type InventoryFilters = Record<string, string | undefined>;

export const getInventoryLink = (
  project: Pick<Project, "id" | "type" | "orgId">,
  filters: InventoryFilters
) => {
  const pinnedLink = getInstancePinningLink(project.orgId, project, "inventory");
  if (!pinnedLink) throw new Error("The inventory link needs a Certificate Manager project");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...pinnedLink, search: filters as any };
};

export type InventoryLink = ReturnType<typeof getInventoryLink>;

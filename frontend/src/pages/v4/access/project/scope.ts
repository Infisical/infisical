import { useLocation, useParams } from "@tanstack/react-router";

import { urlSlugToProjectType } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

export type ProjectScope = { orgId: string; projectId: string; projectType: ProjectType };

export const useProjectScope = (): ProjectScope => {
  const { orgId = "", projectId = "" } = useParams({ strict: false });
  const slug = useLocation({
    select: (location) => location.pathname.match(/\/projects\/([^/]+)\//)?.[1]
  });
  return {
    orgId,
    projectId,
    projectType: urlSlugToProjectType(slug ?? "") ?? ProjectType.SecretManager
  };
};

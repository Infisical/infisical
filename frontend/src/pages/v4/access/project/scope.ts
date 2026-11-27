import { createContext, useContext } from "react";
import { useLocation, useParams } from "@tanstack/react-router";

import { urlSlugToProjectType } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

export type ProjectScope = { orgId: string; projectId: string; projectType: ProjectType };

export const ORG_SCOPED_ACCESS_PRODUCTS = new Set<ProjectType>([
  ProjectType.CertificateManager,
  ProjectType.SecretScanning,
  ProjectType.PAM
]);

export const ProductProjectScope = createContext<ProjectScope | undefined>(undefined);

export const useProjectScope = (): ProjectScope => {
  const provided = useContext(ProductProjectScope);
  const { orgId = "", projectId = "" } = useParams({ strict: false });
  const slug = useLocation({
    select: (location) => location.pathname.match(/\/projects\/([^/]+)\//)?.[1]
  });
  if (provided) return provided;
  return {
    orgId,
    projectId,
    projectType: urlSlugToProjectType(slug ?? "") ?? ProjectType.SecretManager
  };
};

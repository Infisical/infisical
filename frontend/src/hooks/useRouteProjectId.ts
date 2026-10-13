import { useParams } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { useImplicitProduct } from "./useImplicitProduct";
import { useImplicitProjectId } from "./useImplicitProjectId";

// The project a page is scoped to, for views shared between org and project pages: the $projectId in
// the URL, or Certificate Manager's implicit project, which its URLs no longer carry.
export const useRouteProjectId = (): string | undefined => {
  const { projectId } = useParams({ strict: false });
  const implicitProduct = useImplicitProduct();
  const implicitProjectId = useImplicitProjectId();

  if (projectId) return projectId;
  if (implicitProduct === ProjectType.CertificateManager) return implicitProjectId ?? undefined;
  return undefined;
};

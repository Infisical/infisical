import { useParams } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { useImplicitProduct } from "./useImplicitProduct";
import { useImplicitProjectId } from "./useImplicitProjectId";

// The project a page is scoped to, for views shared between org and project pages: the $projectId in
// the URL, or Certificate Manager's or Secret Scanning's implicit project, which their URLs no longer carry.
export const useRouteProjectId = (): string | undefined => {
  const { projectId } = useParams({ strict: false });
  const implicitProduct = useImplicitProduct();
  const implicitProjectId = useImplicitProjectId();

  if (projectId) return projectId;
  if (
    implicitProduct === ProjectType.CertificateManager ||
    implicitProduct === ProjectType.SecretScanning
  )
    return implicitProjectId ?? undefined;
  return undefined;
};

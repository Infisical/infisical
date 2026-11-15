import { hasProjectTemplates, urlSlugToProjectType } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

import { orgHref, useGo } from "../../links";

export const useProductSettingsRedirect = (orgId: string, type: string) => {
  const go = useGo();
  const projectType = urlSlugToProjectType(type);
  let href: string | undefined;
  if (projectType === ProjectType.SecretManager)
    href = orgHref(orgId, "/projects/secret-management/product-settings");
  else if (!projectType || !hasProjectTemplates(projectType)) href = orgHref(orgId, "/projects");
  if (!href) return undefined;
  const { to, search } = go.link(href);
  return { to, search };
};

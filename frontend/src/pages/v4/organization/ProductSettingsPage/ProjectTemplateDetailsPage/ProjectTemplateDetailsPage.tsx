import { Navigate, useParams } from "@tanstack/react-router";

import { urlSlugToProjectType } from "@app/helpers/project";
import type { ProjectType } from "@app/hooks/api/projects/types";

import { orgHref } from "../../../links";
import { TemplateDetail } from "../components/template-detail";
import { useProductSettingsRedirect } from "../redirect";

export const ProjectTemplateDetailsPage = () => {
  const { orgId, type, templateId } = useParams({
    from: "/v4/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId"
  });
  const redirect = useProductSettingsRedirect(orgId, type);
  if (redirect) return <Navigate replace {...redirect} />;
  const back = orgHref(orgId, `/projects/product-settings/${type}`);
  return (
    <TemplateDetail
      templateId={templateId}
      projectType={urlSlugToProjectType(type) as ProjectType}
      links={{
        back,
        backLabel: "Product settings",
        template: `${back}/project-templates/${templateId}`
      }}
    />
  );
};

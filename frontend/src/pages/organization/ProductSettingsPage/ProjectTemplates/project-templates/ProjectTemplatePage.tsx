import { useNavigate, useParams } from "@tanstack/react-router";

import { urlSlugToProjectType } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ProjectTemplatePage as ProjectTemplatePageBase } from "../../project-templates/ProjectTemplatePage";

export const ProjectTemplatePage = () => {
  const navigate = useNavigate();
  const { orgId, type, templateId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId"
  });

  return (
    <ProjectTemplatePageBase
      templateId={templateId}
      projectType={urlSlugToProjectType(type) as ProjectType}
      onBack={() =>
        navigate({
          to: "/organizations/$orgId/projects/product-settings/$type",
          params: { orgId, type }
        })
      }
    />
  );
};

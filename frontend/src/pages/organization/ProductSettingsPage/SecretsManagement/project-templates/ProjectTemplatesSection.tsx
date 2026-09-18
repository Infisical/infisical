import { useNavigate } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectTemplate } from "@app/hooks/api/projectTemplates";

import { ProjectTemplatesSection as ProjectTemplatesSectionBase } from "../../project-templates/ProjectTemplatesSection";

export const ProjectTemplatesSection = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const navigateToTemplate = (template: TProjectTemplate) => {
    if (!currentOrg?.id) return;

    navigate({
      to: "/organizations/$orgId/projects/secret-management/product-settings/project-templates/$templateId" as const,
      params: {
        orgId: currentOrg.id,
        templateId: template.id
      }
    });
  };

  return (
    <ProjectTemplatesSectionBase
      projectType={ProjectType.SecretManager}
      onTemplateSelect={navigateToTemplate}
    />
  );
};

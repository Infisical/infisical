import { linkOptions } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectTemplate } from "@app/hooks/api/projectTemplates";

import { ProjectTemplatesSection as ProjectTemplatesSectionBase } from "../../project-templates/ProjectTemplatesSection";

export const ProjectTemplatesSection = () => {
  const { currentOrg } = useOrganization();

  const getTemplateLink = (template: TProjectTemplate) =>
    linkOptions({
      to: "/organizations/$orgId/projects/secret-management/product-settings/project-templates/$templateId" as const,
      params: {
        orgId: currentOrg.id,
        templateId: template.id
      }
    });

  return (
    <ProjectTemplatesSectionBase
      projectType={ProjectType.SecretManager}
      getTemplateLink={getTemplateLink}
    />
  );
};

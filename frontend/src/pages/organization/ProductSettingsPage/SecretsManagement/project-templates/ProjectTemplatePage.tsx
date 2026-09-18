import { useNavigate } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ProjectTemplatePage as ProjectTemplatePageBase } from "../../project-templates/ProjectTemplatePage";

type Props = {
  templateId: string;
};

export const ProjectTemplatePage = ({ templateId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();

  const navigateBack = () => {
    if (!currentOrg?.id) return;

    navigate({
      to: "/organizations/$orgId/projects/secret-management/product-settings" as const,
      params: {
        orgId: currentOrg.id
      }
    });
  };

  return (
    <ProjectTemplatePageBase
      templateId={templateId}
      projectType={ProjectType.SecretManager}
      onBack={navigateBack}
    />
  );
};

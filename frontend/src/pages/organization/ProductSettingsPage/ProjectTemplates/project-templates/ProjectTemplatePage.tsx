import { useNavigate, useParams } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { urlSlugToProjectType } from "@app/helpers/project";

import { ProjectTemplatePage as ProjectTemplatePageBase } from "../../project-templates/ProjectTemplatePage";

type Props = { templateId: string };

export const ProjectTemplatePage = ({ templateId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { type } = useParams({ strict: false });
  const projectType = urlSlugToProjectType(type as string)!;

  return (
    <ProjectTemplatePageBase
      templateId={templateId}
      projectType={projectType}
      onBack={() =>
        navigate({
          to: "/organizations/$orgId/projects/product-settings/$type",
          params: { orgId: currentOrg.id, type: type as string }
        })
      }
    />
  );
};

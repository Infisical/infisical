import { useParams } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { orgHref } from "../../../../links";
import { TemplateDetail } from "../../components/template-detail";

export const ProjectTemplateDetailsPage = () => {
  const { orgId, templateId } = useParams({
    from: "/v4/organizations/$orgId/projects/secret-management/product-settings/project-templates/$templateId"
  });
  const back = orgHref(orgId, "/projects/secret-management/product-settings");
  return (
    <TemplateDetail
      templateId={templateId}
      projectType={ProjectType.SecretManager}
      links={{
        back,
        backLabel: "Product settings",
        template: `${back}/project-templates/${templateId}`
      }}
    />
  );
};

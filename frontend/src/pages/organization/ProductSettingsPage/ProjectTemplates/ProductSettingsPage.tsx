import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";

import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectTitle, urlSlugToProjectType } from "@app/helpers/project";
import { TProjectTemplate } from "@app/hooks/api/projectTemplates";

import { ProjectTemplatesSection } from "../project-templates/ProjectTemplatesSection";

export const ProductSettingsPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { type } = useParams({ strict: false });
  const projectType = urlSlugToProjectType(type as string)!;

  const navigateToTemplate = (template: TProjectTemplate) => {
    navigate({
      to: "/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId",
      params: { orgId: currentOrg.id, type: type as string, templateId: template.id }
    });
  };

  return (
    <>
      <Helmet>
        <title>Product Settings | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="h-full">
        <div className="mx-auto h-full w-full max-w-8xl bg-bunker-800 text-white">
          <PageHeader
            scope={projectType}
            title="Product Settings"
            description={`Configure organization-wide settings for ${getProjectTitle(projectType)} projects.`}
          />
          <div className="flex flex-col gap-4 pb-8">
            <OrgPermissionCan
              I={OrgPermissionActions.Read}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) =>
                isAllowed && (
                  <ProjectTemplatesSection
                    projectType={projectType}
                    onTemplateSelect={navigateToTemplate}
                  />
                )
              }
            </OrgPermissionCan>
          </div>
        </div>
      </div>
    </>
  );
};

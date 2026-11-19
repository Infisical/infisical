import { linkOptions, useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3/platform";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectTitle, urlSlugToProjectType } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";
import { TProjectTemplate } from "@app/hooks/api/projectTemplates";

import { ProjectTemplatesSection } from "../project-templates/ProjectTemplatesSection";

export const ProductSettingsPage = () => {
  const { currentOrg } = useOrganization();
  const { type } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/product-settings/$type/"
  });
  const projectType = urlSlugToProjectType(type) as ProjectType;

  const getTemplateLink = (template: TProjectTemplate) =>
    linkOptions({
      to: "/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId",
      params: { orgId: currentOrg.id, type, templateId: template.id }
    });

  return (
    <>
      <PageTitle title="Product Settings" />
      <link rel="icon" href="/infisical.ico" />
      <div>
        <div className="mx-auto w-full max-w-8xl bg-page text-foreground-inverse">
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
                    getTemplateLink={getTemplateLink}
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

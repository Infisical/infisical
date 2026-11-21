import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { Navigate, useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { urlSlugToProjectType } from "@app/helpers/project";
import { type ProjectType } from "@app/hooks/api/projects/types";

import { useOrgPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { orgHref } from "../../links";
import { ProjectTemplatesSection } from "./components/templates-section";
import { useProductSettingsRedirect } from "./redirect";

export const ProductSettingsPage = () => {
  const { orgId, type } = useParams({
    from: "/v4/organizations/$orgId/projects/product-settings/$type/"
  });
  const { permission } = useOrgPermission();
  const redirect = useProductSettingsRedirect(orgId, type);
  if (redirect) return <Navigate replace {...redirect} />;
  const projectType = urlSlugToProjectType(type) as ProjectType;
  return (
    <TooltipProvider>
      <PageTitle title="Product Settings" />
      <Stack gap={24}>
        <PageHeader title="Product settings" />
        {permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates) ? (
          <ProjectTemplatesSection
            projectType={projectType}
            templateHref={(templateId) =>
              orgHref(orgId, `/projects/product-settings/${type}/project-templates/${templateId}`)
            }
          />
        ) : (
          <AccessRestricted requirement="read Project Templates" />
        )}
      </Stack>
    </TooltipProvider>
  );
};

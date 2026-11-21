import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";

import { PageTitle } from "@app/components/PageTitle";
import {
  OrgPermissionActions,
  OrgPermissionHoneyTokenActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useOrgId, useOrgPermission } from "../../../access/permissions";
import { useV4Adapter } from "../../../data/adapters";
import { orgHref } from "../../../links";
import { ProjectTemplatesSection } from "../components/templates-section";
import { HoneyTokensCard } from "./honey-tokens";
import { PoliciesCard } from "./policies-card";

const noop = () => {};

export const ProductSettingsPage = () => {
  const orgId = useOrgId();
  const { permission } = useOrgPermission();
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const { data: subscription } = useV4Adapter("productSettings").useSubscription(orgId);
  return (
    <TooltipProvider>
      <PageTitle title="Product Settings" />
      <Stack gap={24}>
        <PageHeader title="Product settings" />
        {organization ? (
          <PoliciesCard
            organization={organization}
            canEdit={permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings)}
            crossProjectSharingLicensed={Boolean(subscription?.crossProjectSecretSharing)}
          />
        ) : (
          <SettingsCard title="Policies" loading onSave={noop} />
        )}
        <HoneyTokensCard
          canSetup={permission.can(
            OrgPermissionHoneyTokenActions.Setup,
            OrgPermissionSubjects.HoneyTokens
          )}
        />
        {permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates) && (
          <ProjectTemplatesSection
            projectType={ProjectType.SecretManager}
            templateHref={(templateId) =>
              orgHref(
                orgId,
                `/projects/secret-management/product-settings/project-templates/${templateId}`
              )
            }
          />
        )}
      </Stack>
    </TooltipProvider>
  );
};

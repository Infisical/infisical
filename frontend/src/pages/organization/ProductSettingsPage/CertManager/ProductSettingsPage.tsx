import { PageTitle } from "@app/components/PageTitle";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3/platform";
import {
  OrgPermissionCertManagerActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ProjectsSection } from "./ProjectsSection";

export const ProductSettingsPage = () => (
  <>
    <PageTitle title="Product Settings" />
    <div className="mx-auto w-full max-w-8xl bg-page text-foreground-inverse">
      <PageHeader
        scope={ProjectType.CertificateManager}
        title="Product Settings"
        description="Manage the Certificate Manager projects in your organization."
      />
      <div className="flex flex-col gap-4 pb-8">
        <OrgPermissionCan
          renderGuardBanner
          I={OrgPermissionCertManagerActions.ManageInstance}
          a={OrgPermissionSubjects.CertManager}
        >
          <ProjectsSection />
        </OrgPermissionCan>
      </div>
    </div>
  </>
);

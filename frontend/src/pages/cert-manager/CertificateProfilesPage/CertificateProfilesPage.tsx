import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionCertificateProfileActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CertificateProfilesTab } from "../PoliciesPage/components";

export const CertificateProfilesPage = () => {
  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-page text-foreground-inverse">
      <PageTitle title="Certificate Profiles" />
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Certificate Profiles"
          description="Reusable presets that pair a certificate authority with a policy to issue certificates."
        />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCertificateProfileActions.Read}
          a={ProjectPermissionSub.CertificateProfiles}
        >
          <CertificateProfilesTab />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};

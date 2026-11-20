import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionCertificatePolicyActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CertificatePoliciesTab } from "../PoliciesPage/components";

export const CertificatePoliciesPage = () => {
  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-page text-foreground-inverse">
      <PageTitle title="Certificate Policies" />
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Certificate Policies"
          description="Rules that define what certificates can look like, how they can be used, and how long they stay valid."
        />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCertificatePolicyActions.Read}
          a={ProjectPermissionSub.CertificatePolicies}
        >
          <CertificatePoliciesTab />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};

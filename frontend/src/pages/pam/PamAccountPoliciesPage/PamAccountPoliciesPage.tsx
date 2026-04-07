import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountPolicyActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PamAccountPoliciesSection } from "./components/PamAccountPoliciesSection";

export const PamAccountPoliciesPage = () => {
  const { t } = useTranslation();
  const { projectId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/account-policies"
  });

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Account Policies" })}</title>
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionPamAccountPolicyActions.Read}
        a={ProjectPermissionSub.PamAccountPolicies}
      >
        <div className="h-full bg-bunker-800">
          <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <div className="mx-auto mb-6 w-full max-w-8xl">
              <PageHeader
                scope={ProjectType.PAM}
                title="Account Policies"
                description="Manage behavioral rules for PAM accounts."
              />
              <PamAccountPoliciesSection projectId={projectId} />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};

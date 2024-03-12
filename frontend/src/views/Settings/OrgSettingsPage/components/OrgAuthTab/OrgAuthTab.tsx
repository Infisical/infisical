import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGeneralAuthSection } from "./OrgGeneralAuthSection";
import { OrgLDAPSection } from "./OrgLDAPSection";
import { OrgScimSection } from "./OrgSCIMSection";
import { OrgSSOSection } from "./OrgSSOSection";

export const OrgAuthTab = withPermission(
  () => {
    return (
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
        <OrgGeneralAuthSection />
        <OrgSSOSection />
        <OrgLDAPSection />
        <OrgScimSection />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);

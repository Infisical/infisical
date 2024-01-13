import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgLDAPSection } from "./OrgLDAPSection";
import { OrgSSOSection } from "./OrgSSOSection";

export const OrgAuthTab = withPermission(
  () => {
    return (
      <div>
        <OrgSSOSection />
        <OrgLDAPSection />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);

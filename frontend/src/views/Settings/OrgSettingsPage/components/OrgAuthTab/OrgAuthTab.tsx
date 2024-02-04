import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgSSOSection } from "./OrgSSOSection";

export const OrgAuthTab = withPermission(
  () => {
    return (
      <div>
        <OrgSSOSection />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);

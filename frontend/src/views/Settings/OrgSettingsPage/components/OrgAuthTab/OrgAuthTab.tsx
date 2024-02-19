import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgGeneralAuthSection } from "./OrgGeneralAuthSection";
import { OrgScimSection } from "./OrgSCIMSection";
import { OrgSSOSection } from "./OrgSSOSection";

export const OrgAuthTab = withPermission(
  () => {
    return (
      <div>
        <OrgGeneralAuthSection />
        <OrgSSOSection />
        <OrgScimSection />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Sso }
);
